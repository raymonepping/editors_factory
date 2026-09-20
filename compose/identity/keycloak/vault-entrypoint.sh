#!/bin/sh
# compose/identity/keycloak/vault-entrypoint.sh —
# prompts/improvements/01_07_vault_kv_secrets_migration.md
#
# keycloak/keycloak:26.6.4 does not support _FILE for either the
# deprecated KEYCLOAK_ADMIN_PASSWORD or the current
# KC_BOOTSTRAP_ADMIN_PASSWORD — confirmed live: the _FILE variant either
# silently fails to apply the password or refuses to start entirely (see
# this prompt's own design notes). This image needs the literal env var
# populated before its real process starts, so this wrapper reads the
# value identity-secrets-init already rendered to the shared volume,
# exports it under the non-deprecated KC_BOOTSTRAP_ADMIN_* names, then
# execs the image's actual entrypoint.
set -eu

secrets_dir="${IDENTITY_SECRETS_DIR:-/run/secrets}"
password_file="$secrets_dir/keycloak-admin-password"

echo "[vault-entrypoint] waiting for $password_file..."
attempt=0
until [ -s "$password_file" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "[vault-entrypoint] $password_file never appeared after $((attempt * 2))s" >&2
    exit 1
  fi
  sleep 2
done

KC_BOOTSTRAP_ADMIN_USERNAME="${KEYCLOAK_ADMIN:-admin}"
KC_BOOTSTRAP_ADMIN_PASSWORD="$(cat "$password_file")"
export KC_BOOTSTRAP_ADMIN_USERNAME KC_BOOTSTRAP_ADMIN_PASSWORD

echo "[vault-entrypoint] admin bootstrap credentials exported, starting Keycloak"
exec /opt/keycloak/bin/kc.sh "$@"
