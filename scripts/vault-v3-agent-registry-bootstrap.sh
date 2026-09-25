#!/usr/bin/env bash
# scripts/vault-v3-agent-registry-bootstrap.sh — prompts/v3/03_01,
# extended by prompts/v3/03_02.
#
# Registers the v3 agent identity in Agent Registry and binds its
# entity-alias, the two pieces of the v3 root-scoped credential path
# that terraform/vault-platform/v3-root-credential-path.tf explicitly
# does NOT manage — found live that agent-registry/register and
# identity/entity-alias are POST-only Vault paths with no matching GET
# (405 "unsupported operation"), and this project's pinned Vault
# Terraform provider (v4.x) can't track a resource it can never
# successfully read back, even with disable_read set (terraform
# import's own refresh reads unconditionally). Same idea as
# scripts/vault-secrets-bootstrap.sh: idempotent, safe to re-run,
# reads the current value back and no-ops if it already matches rather
# than blindly re-writing.
#
# Must run AFTER terraform/vault-platform's own apply (creates
# vault_identity_entity.v3_agent/v3_human and
# vault_policy.v3_agent_baseline/v3_human_baseline, all referenced
# below) and AFTER vault-database's own apply of database-v3
# (terraform/vault-database/database-v3.tf) — this script only wires
# identity, not the credential path's own target role.
#
# 03_02's second block (below the agent block) does the same for the
# human side of OBO delegation — an entity-alias only, no Agent
# Registry registration (only an agent needs to *be* registered there;
# a human only needs an entity + alias so its own baseline policy
# resolves). external_id is the real, live-confirmed Keycloak `sub`
# for the `raymon` demo account — read directly from the live
# `sessions` table (`SELECT subject_id FROM sessions WHERE username =
# 'raymon' ORDER BY expires_at DESC LIMIT 1`), not fabricated. This is
# scoped to this one demo LDAP/Keycloak deployment: if that data is
# ever wiped and re-seeded, Keycloak assigns a new `sub` on `raymon`'s
# next login and HUMAN_SUBJECT below needs recapturing the same way.
set -euo pipefail
umask 077
# shellcheck source=scripts/vault-common.sh
source "$(dirname -- "$0")/vault-common.sh"
cd "$VAULT_PROJECT_ROOT"

ADMIN_TOKEN_FILE="$VAULT_STATE/vault-admin-token"
[ -s "$ADMIN_TOKEN_FILE" ] || {
  echo "No vault-admin token — run 'make vault-admin-bootstrap' first." >&2
  exit 1
}

vault_node_leader
vault_wait unsealed

VAULT_TOKEN=$(cat "$ADMIN_TOKEN_FILE")
export VAULT_TOKEN

ENTITY_NAME="v3-agent-identity"
POLICY_NAME="v3-agent-baseline"
ISSUER="https://factory-api.local/v3-demo-issuer"
SUBJECT="factory-agent-c-v3"
ALIAS_NAME="v3-agent-jwt-binding"

# Read by Terraform output rather than identity/entity/name/* —
# vault-admin isn't granted that lookup path (only identity/entity and
# identity/entity/id/*), and adding a grant just for this one read
# isn't worth another apply round-trip when the ID is already sitting
# in vault-platform's own state.
entity_id=$(terraform -chdir="$VAULT_PROJECT_ROOT/terraform/vault-platform" output -raw v3_agent_entity_id 2>/dev/null) || {
  echo "Could not read v3_agent_entity_id output — run terraform/vault-platform's own apply first." >&2
  exit 1
}

echo "Entity: $ENTITY_NAME ($entity_id)"

current_registration=$(curl -sk -H "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/agent-registry/registration/entity-id/$entity_id" 2>/dev/null || true)

if echo "$current_registration" | jq -e '.data.entity_id' >/dev/null 2>&1; then
  echo "Agent Registry registration already exists for $entity_id — leaving as is."
else
  echo "Registering $entity_id in Agent Registry..."
  curl -sk -H "X-Vault-Token: $VAULT_TOKEN" -X POST \
    -d "$(jq -n --arg eid "$entity_id" --arg pol "$POLICY_NAME" \
      '{display_name: "v3-agent", entity_id: $eid, ceiling_policies: [$pol], description: "v3 root-scoped credential path — prompts/v3/03_01"}')" \
    "$VAULT_ADDR/v1/agent-registry/register" | jq -e '.data.id' >/dev/null
  echo "Registered."
fi

current_aliases=$(curl -sk -H "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/identity/entity/id/$entity_id" | jq -r '.data.aliases[]?.name // empty')

if grep -qx "$ALIAS_NAME" <<<"$current_aliases"; then
  echo "Entity-alias '$ALIAS_NAME' already exists — leaving as is."
else
  echo "Creating entity-alias '$ALIAS_NAME' (issuer=$ISSUER, external_id=$SUBJECT)..."
  curl -sk -H "X-Vault-Token: $VAULT_TOKEN" -X POST \
    -d "$(jq -n --arg name "$ALIAS_NAME" --arg cid "$entity_id" --arg iss "$ISSUER" --arg sub "$SUBJECT" \
      '{name: $name, canonical_id: $cid, issuer: $iss, external_id: $sub}')" \
    "$VAULT_ADDR/v1/identity/entity-alias" | jq -e '.data.id' >/dev/null
  echo "Alias created."
fi

echo
echo "v3 agent identity fully wired: entity, Agent Registry registration, entity-alias."

# --- 03_02: the human side of OBO delegation ---

HUMAN_ENTITY_NAME="v3-human-identity"
HUMAN_ALIAS_NAME="v3-human-jwt-binding"
HUMAN_SUBJECT="53feffe3-7c90-46b5-9949-675d6860957d" # raymon's Keycloak sub — see header comment

human_entity_id=$(terraform -chdir="$VAULT_PROJECT_ROOT/terraform/vault-platform" output -raw v3_human_entity_id 2>/dev/null) || {
  echo "Could not read v3_human_entity_id output — run terraform/vault-platform's own apply first." >&2
  exit 1
}

echo
echo "Human entity: $HUMAN_ENTITY_NAME ($human_entity_id)"

current_human_aliases=$(curl -sk -H "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/identity/entity/id/$human_entity_id" | jq -r '.data.aliases[]?.name // empty')

if grep -qx "$HUMAN_ALIAS_NAME" <<<"$current_human_aliases"; then
  echo "Entity-alias '$HUMAN_ALIAS_NAME' already exists — leaving as is."
else
  echo "Creating entity-alias '$HUMAN_ALIAS_NAME' (issuer=$ISSUER, external_id=$HUMAN_SUBJECT)..."
  curl -sk -H "X-Vault-Token: $VAULT_TOKEN" -X POST \
    -d "$(jq -n --arg name "$HUMAN_ALIAS_NAME" --arg cid "$human_entity_id" --arg iss "$ISSUER" --arg sub "$HUMAN_SUBJECT" \
      '{name: $name, canonical_id: $cid, issuer: $iss, external_id: $sub}')" \
    "$VAULT_ADDR/v1/identity/entity-alias" | jq -e '.data.id' >/dev/null
  echo "Alias created."
fi

echo
echo "v3 human identity fully wired: entity, entity-alias (no Agent Registry registration — humans don't register as agents)."
