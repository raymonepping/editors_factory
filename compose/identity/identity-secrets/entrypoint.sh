#!/bin/sh
# compose/identity/identity-secrets/entrypoint.sh —
# prompts/improvements/01_07_vault_kv_secrets_migration.md
#
# One-shot fetch, not a persistent Vault Agent: these three values don't
# rotate on the DB-credential-lease cadence Agent C's Postgres role does
# (compose/vault/vault-agent/config.hcl's own comment explains why THAT
# one deliberately avoids templates) — they only need to exist once,
# before openldap/keycloak start. A single AppRole login + three
# `vault kv get` calls + exit is simpler than a full Agent
# auto_auth+template config for an identity that only ever logs in once
# per container recreate.
#
# Renders to a shared volume (identity-secrets) mounted read-only into
# openldap, keycloak, and their bootstrap containers — none of which
# talk to Vault directly. This is the ONE place the identity-secrets
# AppRole credential is used.
set -eu

: "${IDENTITY_SECRETS_ROLE_ID:?IDENTITY_SECRETS_ROLE_ID is required}"
: "${IDENTITY_SECRETS_SECRET_ID:?IDENTITY_SECRETS_SECRET_ID is required}"

export VAULT_ADDR="${VAULT_ADDR:-https://vault-1:8200}"
export VAULT_CACERT="${VAULT_CACERT:-/vault/tls/ca-chain.pem}"
export VAULT_NAMESPACE="${VAULT_NAMESPACE:-factory}"

echo "[identity-secrets-init] authenticating via AppRole..."
attempt=0
until VAULT_TOKEN=$(vault write -field=token auth/approle/login \
  role_id="$IDENTITY_SECRETS_ROLE_ID" secret_id="$IDENTITY_SECRETS_SECRET_ID" 2>/tmp/login.err); do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 15 ]; then
    echo "[identity-secrets-init] AppRole login failed after $((attempt * 2))s:" >&2
    cat /tmp/login.err >&2
    exit 1
  fi
  sleep 2
done
export VAULT_TOKEN

umask 077
out=/run/secrets
vault kv get -field=value secret/identity/ldap-admin-password >"$out/ldap-admin-password"
vault kv get -field=value secret/identity/keycloak-admin-password >"$out/keycloak-admin-password"
vault kv get -field=value secret/identity/oidc-client-secret >"$out/oidc-client-secret"
chmod 0644 "$out/ldap-admin-password" "$out/keycloak-admin-password" "$out/oidc-client-secret"

vault token revoke -self >/dev/null 2>&1 || true
echo "[identity-secrets-init] rendered 3 secrets to $out, token revoked"
