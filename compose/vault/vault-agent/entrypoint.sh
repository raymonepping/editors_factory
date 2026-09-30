#!/bin/sh
# compose/vault/vault-agent/entrypoint.sh — prompts/hardening/03_00_vault_agent_sidecar.md
#
# Vault Agent reads role-id and secret-id from the shared /run/approle volume,
# which is managed and automatically rotated by the vault-rotator sidecar.
# If files are not ready on cold start, waits briefly for vault-rotator to initialize them.
set -eu

umask 077

echo "[vault-agent entrypoint] waiting for role-id and secret-id in /run/approle..."
attempt=0
while [ ! -s /run/approle/role-id ] || [ ! -s /run/approle/secret-id ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "[vault-agent entrypoint] timed out waiting for /run/approle files" >&2
    exit 1
  fi
  sleep 1
done

echo "[vault-agent entrypoint] AppRole credentials found, starting vault agent..."
exec vault agent -config=/vault/agent/config.hcl
