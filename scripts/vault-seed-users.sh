#!/bin/sh
# scripts/vault-seed-users.sh — inherited from arcanium (its Prompt 14.5).
#
# NOT YET ADAPTED FOR FACTORY — content, not naming.
#
# The persona list below (ciso/architect/operator/auditor plus two
# fictional tenant-admin accounts) is arcanium's own human-operator/
# multi-tenant demo model. The Factory has no equivalent yet: its actors
# are the AI agents (agent-a/b/c/d) plus, per
# prompts/frontend/01_01_factory_dashboard_ui.md, a single unauthenticated
# local operator — there is no human userpass/persona model to seed.
# Renaming "Arcanium-ciso-2026" to "Factory-ciso-2026" would fabricate a
# feature this project does not have (prompts/base_project/01_01_factory_stack.md's
# "Reused tooling" section calls this out explicitly: a careful, reviewed
# rename, not a blind regex). Only the container-name reference below was
# fixed, since that part is genuinely mechanical/project-neutral. If a
# human-approval or persona model is ever added to Factory (see
# security/authority-model.md for whether that becomes relevant), replace
# the persona list with Factory's own real personas before using this
# script — do not just rename the existing one.
#
# Enables Vault userpass and seeds the demo persona users. Idempotent.
# Passwords are POC-only.

set -eu
REPO_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
ROOT=$(python3 -c "import json;print(json.load(open('$REPO_ROOT/.secrets/vault/cluster-init.json'))['root_token'])")

vx() { podman exec -e VAULT_ADDR=https://127.0.0.1:8200 -e VAULT_SKIP_VERIFY=1 \
  -e VAULT_TOKEN="$ROOT" factory-vault_1 "$@"; }

vx sh -c 'vault auth enable userpass 2>/dev/null || true'

for pair in \
  "ciso:Arcanium-ciso-2026" \
  "architect:Arcanium-arch-2026" \
  "operator:Arcanium-ops-2026" \
  "auditor:Arcanium-audit-2026" \
  "pepsi-admin:Arcanium-pepsi-2026" \
  "cocacola-admin:Arcanium-cocacola-2026"; do
  u=${pair%%:*}
  p=${pair#*:}
  vx vault write "auth/userpass/users/$u" password="$p" token_policies=default token_ttl=1h >/dev/null
  echo "  ✓ $u"
done
echo "  ✓ userpass users seeded"
