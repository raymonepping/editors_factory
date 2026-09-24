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

# ── v3 prework (prompts/v3/03_00_v3_prework.md) — a separate,
# machine-to-machine service-account client for the Vault Agentic IAM /
# OAuth Resource Server spike. Deliberately not the same client as
# CLIENT_ID above: this project already treats human, agent, and
# CLI-operator identity as three separate trust domains
# (security/authority-model.md), and this is a fourth, not a reuse of
# the human-login client's own scope. client_credentials only — no
# redirect URI, no browser flow, matching how an agent (not a human)
# would actually obtain a token.
AGENTIC_SPIKE_CLIENT_ID=factory-agentic-iam-spike

get_agentic_spike_client_uuid() {
  "$KC" get clients -r "$REALM" -q clientId="$AGENTIC_SPIKE_CLIENT_ID" --fields id 2>/dev/null | first_id
}

ensure_agentic_spike_client() {
  local uuid
  uuid=$(get_agentic_spike_client_uuid)
  if [ -n "$uuid" ]; then
    echo "  = client exists: $AGENTIC_SPIKE_CLIENT_ID ($uuid)"
  else
    "$KC" create clients -r "$REALM" \
      -s clientId="$AGENTIC_SPIKE_CLIENT_ID" \
      -s protocol=openid-connect \
      -s publicClient=false \
      -s standardFlowEnabled=false \
      -s implicitFlowEnabled=false \
      -s directAccessGrantsEnabled=false \
      -s serviceAccountsEnabled=true \
      -s redirectUris='[]' \
      -s webOrigins='[]'
    uuid=$(get_agentic_spike_client_uuid)
    echo "  + client created: $AGENTIC_SPIKE_CLIENT_ID ($uuid)"
  fi
  echo "$uuid"
}

# authorization_details claim mapper — a hardcoded-value mapper (not a
# real per-request value; Keycloak has no native RAR support to draw
# this from). Good enough for the spike's own Phase 3 question ("what
# does Vault actually do with this claim"), not a template for how a
# real v3 would mint one — a real implementation would need the caller
# (the backend, not Keycloak) to set this per-request, which almost
# certainly means constructing the JWT differently than a Keycloak
# client credentials grant does. That distinction belongs in this
# prompt's own findings, not silently papered over here.
ensure_authorization_details_mapper() {
  local uuid="$1"
  local existing
  existing=$("$KC" get "clients/$uuid/protocol-mappers/models" -r "$REALM" 2>/dev/null |
    { grep -B8 '"name" *: *"authorization_details"' || true; } | { grep '"id" *:' || true; } | tail -1 |
    sed -E 's/.*"id" *: *"([^"]*)".*/\1/')
  if [ -n "$existing" ]; then
    echo "  = authorization_details claim mapper exists"
    return
  fi
  # Nested-JSON config value doesn't survive kcadm.sh's own -s key=value
  # parsing reliably (found live: "Cannot parse the JSON [unknown_error]"
  # on the first attempt) — a real request body file, not many -s flags,
  # is the robust way to pass a mapper config this shaped.
  local body
  body=$(mktemp)
  cat >"$body" <<'JSON'
{
  "name": "authorization_details",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-hardcoded-claim-mapper",
  "config": {
    "claim.name": "authorization_details",
    "claim.value": "[{\"type\":\"vault:path_access\",\"path\":\"database/creds/factory-good-role\",\"capabilities\":[\"read\"]}]",
    "jsonType.label": "JSON",
    "id.token.claim": "false",
    "access.token.claim": "true",
    "userinfo.token.claim": "false"
  }
}
JSON
  "$KC" create "clients/$uuid/protocol-mappers/models" -r "$REALM" -f "$body"
  rm -f "$body"
  echo "  + authorization_details claim mapper created (spike-only hardcoded value)"
}

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

echo "-> v3 prework: agentic IAM spike client"
SPIKE_UUID=$(ensure_agentic_spike_client | tail -1)
ensure_authorization_details_mapper "$SPIKE_UUID"
SPIKE_SECRET=$(get_client_secret "$SPIKE_UUID")

echo
echo "================================================================"
echo "Keycloak realm '$REALM' ready."
echo "Client:  $CLIENT_ID"
echo "Secret:  $SECRET"
echo
echo "Add to .env (never commit):"
echo "  FACTORY_OIDC_CLIENT_SECRET=$SECRET"
echo "----------------------------------------------------------------"
echo "v3 prework spike client: $AGENTIC_SPIKE_CLIENT_ID"
echo "Spike client secret:     $SPIKE_SECRET"
echo "(client_credentials only — not used by any running service yet)"
echo "================================================================"
