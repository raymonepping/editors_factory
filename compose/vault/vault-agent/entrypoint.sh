#!/bin/sh
# compose/vault/vault-agent/entrypoint.sh — prompts/base_project/02_02_vault_follow_up.md
#
# Vault Agent's AppRole auto-auth method needs role_id/secret_id as
# FILES, not env vars. This project's credential-issuance path
# (terraform/vault-platform/ + a manual `vault write .../secret-id`)
# writes them into .env as FACTORY_VAULT_ROLE_ID/FACTORY_VAULT_SECRET_ID,
# matching arcanium's own equivalent convention. This script is a
# translation shim only — it does not mint a new credential, it writes
# the SAME existing values to files so Agent can read them, then execs
# Agent itself.
#
# The secret_id value is never echoed or logged.
set -eu

: "${FACTORY_VAULT_ROLE_ID:?FACTORY_VAULT_ROLE_ID is required}"
: "${FACTORY_VAULT_SECRET_ID:?FACTORY_VAULT_SECRET_ID is required}"

umask 077
printf '%s' "$FACTORY_VAULT_ROLE_ID" >/tmp/role-id
printf '%s' "$FACTORY_VAULT_SECRET_ID" >/tmp/secret-id
chmod 600 /tmp/role-id /tmp/secret-id

echo "[vault-agent entrypoint] role-id/secret-id files written, starting vault agent"
exec vault agent -config=/vault/agent/config.hcl
