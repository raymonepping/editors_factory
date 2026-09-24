#!/bin/bash
# setup_keycloak.sh — idempotent realm/federation/client setup for The Factory.
# Runs inside the keycloak-bootstrap container (profiles: ["init"]).
set -euo pipefail

KC=/opt/keycloak/bin/kcadm.sh
KC_URL="${KC_INTERNAL_URL:-http://keycloak:8080}"
REALM=factory
CLIENT_ID=factory-api
LDAP_BASE_DN="dc=factory,dc=local"

# prompts/improvements/01_07_vault_kv_secrets_migration.md: both values
# are Vault-sourced, rendered by identity-secrets-init onto the shared
# volume this container mounts read-only — the same admin password file
# Keycloak's own vault-entrypoint.sh wrapper reads, not a hand-edited
# .env value.
KEYCLOAK_ADMIN_PASSWORD="$(cat "${KEYCLOAK_ADMIN_PASSWORD_FILE:-/run/secrets/keycloak-admin-password}")"
FACTORY_OIDC_CLIENT_SECRET="$(cat "${FACTORY_OIDC_CLIENT_SECRET_FILE:-/run/secrets/oidc-client-secret}")"
LDAP_ADMIN_PASSWORD="$(cat "${LDAP_ADMIN_PASSWORD_FILE:-/run/secrets/ldap-admin-password}")"

echo "Waiting for Keycloak at ${KC_URL}..."
attempt=0
until "$KC" config credentials --server "$KC_URL" --realm master \
  --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" 2>/tmp/kcadm-login.err; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 40 ]; then
    echo "Keycloak did not become ready after $((attempt * 3))s:" >&2
    cat /tmp/kcadm-login.err >&2
    exit 1
  fi
  sleep 3
done

# ── realm ────────────────────────────────────────────────────────────────
ensure_realm() {
  if "$KC" get "realms/$REALM" >/dev/null 2>&1; then
    echo "  = realm exists: $REALM"
  else
    "$KC" create realms -s realm="$REALM" -s enabled=true -s sslRequired=NONE \
      -s accessTokenLifespan=300 -s ssoSessionIdleTimeout=3600 -s ssoSessionMaxLifespan=36000
    echo "  + realm created: $REALM"
  fi
}

first_id() {
  grep -m1 '"id" *:' | sed -E 's/.*"id" *: *"([^"]*)".*/\1/'
  return 0
}

# ── LDAP federation + group mapper ─────────────────────────────────────────
get_component_id() {
  "$KC" get components -r "$REALM" -q "name=$1" --fields id 2>/dev/null | first_id
}

ensure_ldap_federation() {
  local id
  id=$(get_component_id factory-ldap)
  if [ -n "$id" ]; then
    echo "  = LDAP federation exists: $id"
  else
    id=$("$KC" create components -r "$REALM" -i \
      -s name=factory-ldap \
      -s providerId=ldap \
      -s providerType=org.keycloak.storage.UserStorageProvider \
      -s 'config.enabled=["true"]' \
      -s 'config.vendor=["other"]' \
      -s 'config.usernameLDAPAttribute=["uid"]' \
      -s 'config.rdnLDAPAttribute=["uid"]' \
      -s 'config.uuidLDAPAttribute=["entryUUID"]' \
      -s 'config.userObjectClasses=["inetOrgPerson, organizationalPerson"]' \
      -s 'config.connectionUrl=["ldap://openldap:389"]' \
      -s "config.usersDn=[\"ou=people,${LDAP_BASE_DN}\"]" \
      -s "config.bindDn=[\"cn=admin,${LDAP_BASE_DN}\"]" \
      -s "config.bindCredential=[\"${LDAP_ADMIN_PASSWORD}\"]" \
      -s 'config.editMode=["READ_ONLY"]' \
      -s 'config.syncRegistrations=["false"]' \
      -s 'config.pagination=["true"]' \
      -s 'config.importEnabled=["true"]' \
      -s 'config.trustEmail=["true"]')
    echo "  + LDAP federation created: $id"
  fi

  local gid
  gid=$(get_component_id factory-groups)
  if [ -n "$gid" ]; then
    echo "  = group mapper exists: $gid"
  else
    gid=$("$KC" create components -r "$REALM" -i \
      -s name=factory-groups \
      -s providerId=group-ldap-mapper \
      -s providerType=org.keycloak.storage.ldap.mappers.LDAPStorageMapper \
      -s parentId="$id" \
      -s "config.\"groups.dn\"=[\"ou=groups,${LDAP_BASE_DN}\"]" \
      -s 'config."group.name.ldap.attribute"=["cn"]' \
      -s 'config."group.object.classes"=["groupOfNames"]' \
      -s 'config."membership.ldap.attribute"=["member"]' \
      -s 'config."membership.attribute.type"=["DN"]' \
      -s 'config.mode=["READ_ONLY"]' \
      -s 'config."preserve.group.inheritance"=["false"]' \
      -s 'config."ignore.missing.groups"=["false"]')
    echo "  + group mapper created: $gid"
  fi

  echo "  -> triggering full LDAP sync"
  "$KC" create "user-storage/${id}/sync?action=triggerFullSync" -r "$REALM" -s x=1 >/dev/null 2>&1 ||
    echo "  ! full sync request did not confirm (non-fatal — Keycloak syncs lazily too)"
}

# ── confidential client ──────────────────────────────────────────────────
get_client_uuid() {
  "$KC" get clients -r "$REALM" -q clientId="$CLIENT_ID" --fields id 2>/dev/null | first_id
}

ensure_client() {
  local uuid
  uuid=$(get_client_uuid)
  local redirect="${FACTORY_API_CALLBACK_URL:-${FACTORY_BASE_URL:-http://localhost:3000}/gateway/api/v1/auth/callback}"
  local post_logout="${FACTORY_BASE_URL:-http://localhost:3000}"
  if [ -n "$uuid" ]; then
    echo "  = client exists: $CLIENT_ID ($uuid)"
    if [ -n "${FACTORY_OIDC_CLIENT_SECRET:-}" ]; then
      "$KC" update "clients/$uuid" -r "$REALM" \
        -s "secret=${FACTORY_OIDC_CLIENT_SECRET}" >/dev/null 2>&1 &&
        echo "  = client secret synced from Vault"
    fi
  else
    # clients/$uuid/client-secret is a regenerate-only sub-resource (POST
    # generates a new random value; PUT with -s value=... silently no-ops
    # — found live doing this migration, printed no error and no success
    # line, and Keycloak kept its own auto-generated secret instead).
    # Setting `secret` directly in the client representation at creation
    # time is the only way this Vault-sourced value actually takes.
    "$KC" create clients -r "$REALM" \
      -s clientId="$CLIENT_ID" \
      -s protocol=openid-connect \
      -s publicClient=false \
      -s standardFlowEnabled=true \
      -s implicitFlowEnabled=false \
      -s directAccessGrantsEnabled=false \
      -s serviceAccountsEnabled=false \
      -s 'attributes."pkce.code.challenge.method"=S256' \
      -s "redirectUris=[\"${redirect}\"]" \
      -s webOrigins='[]' \
      ${FACTORY_OIDC_CLIENT_SECRET:+-s "secret=${FACTORY_OIDC_CLIENT_SECRET}"}
    uuid=$(get_client_uuid)
    echo "  + client created: $CLIENT_ID ($uuid)"
  fi
  "$KC" update "clients/$uuid" -r "$REALM" \
    -s "attributes.\"post.logout.redirect.uris\"=${post_logout}" >/dev/null 2>&1 &&
    echo "  = post-logout redirect URI set: $post_logout"
  echo "$uuid"
}

get_client_secret() {
  "$KC" get "clients/$1/client-secret" -r "$REALM" 2>/dev/null |
    { grep -m1 '"value" *:' || true; } | sed -E 's/.*"value" *: *"([^"]*)".*/\1/'
}

# prompts/v3/03_00's spike client (factory-agentic-iam-spike) and its
# authorization_details mapper lived here, torn down by
# prompts/v3/03_01: 03_00's own findings confirmed Keycloak cannot
# produce a Vault-acceptable token at all (a legacy `typ` body claim
# no protocol mapper can override — see
# prompts/v3/03_00_findings.md and 03_01's own Phase 4), so v3's real
# credential path mints its own tokens instead
# (terraform/vault-secrets' v3_jwt_signing_key, factory-api) rather
# than going through Keycloak. Nothing here recreates that client.

# ── groups claim mapper on the client ─────────────────────────────────────
ensure_group_claim_mapper() {
  local uuid="$1"
  local existing
  existing=$("$KC" get "clients/$uuid/protocol-mappers/models" -r "$REALM" 2>/dev/null |
    { grep -B8 '"name" *: *"groups"' || true; } | { grep '"id" *:' || true; } | tail -1 |
    sed -E 's/.*"id" *: *"([^"]*)".*/\1/')
  if [ -n "$existing" ]; then
    echo "  = groups claim mapper exists"
  else
    "$KC" create "clients/$uuid/protocol-mappers/models" -r "$REALM" \
      -s name=groups \
      -s protocol=openid-connect \
      -s protocolMapper=oidc-group-membership-mapper \
      -s 'config."full.path"=false' \
      -s 'config."id.token.claim"=true' \
      -s 'config."access.token.claim"=true' \
      -s 'config."userinfo.token.claim"=true' \
      -s 'config."claim.name"=groups'
    echo "  + groups claim mapper created"
  fi
}

echo "-> realm"
ensure_realm

echo "-> LDAP federation + group mapper"
ensure_ldap_federation

echo "-> confidential client"
CLIENT_UUID=$(ensure_client | tail -1)

echo "-> groups claim mapper"
ensure_group_claim_mapper "$CLIENT_UUID"

SECRET=$(get_client_secret "$CLIENT_UUID")

echo
echo "================================================================"
echo "Keycloak realm '$REALM' ready."
echo "Client:  $CLIENT_ID"
echo "Secret:  $SECRET"
echo
echo "Add to .env (never commit):"
echo "  FACTORY_OIDC_CLIENT_SECRET=$SECRET"
echo "================================================================"
