# ── factory-api policy, inside the factory namespace ──────────────────────────
#
# Paths are relative to the factory namespace itself (this policy is
# created WITH namespace = factory, so "database/creds/..." here means
# factory/database/creds/... from root's perspective — matching the
# database secrets engine mount in
# prompts/base_project/03_01_postgres_dynamic_creds.md, also mounted
# inside this namespace).

resource "vault_policy" "factory_api" {
  namespace = vault_namespace.factory.path
  name      = "factory-api"
  policy    = <<-EOT
    path "database/creds/factory-bad-role" {
      capabilities = ["read"]
    }

    path "database/creds/factory-good-role" {
      capabilities = ["read"]
    }

    # factory-api's own operational credential — evidence-table
    # bookkeeping and read-only product/order tool calls, unrelated to
    # the agent-c BAD/GOOD mechanism. Not gated by the
    # require-agent-c-for-db-creds Sentinel EGP (see that EGP's own
    # comment in terraform/vault-sentinel/main.tf).
    path "database/creds/factory-backend-role" {
      capabilities = ["read"]
    }

    path "sys/leases/revoke" {
      capabilities = ["update"]
    }

    path "sys/leases/revoke/*" {
      capabilities = ["update"]
    }

    path "sys/leases/renew" {
      capabilities = ["update"]
    }

    path "auth/token/revoke" {
      capabilities = ["update"]
    }

    path "auth/token/revoke-accessor" {
      capabilities = ["update"]
    }

    # Wave 2.5 (prompts/improvements/01_01_improvement.md): renews the
    # child token that requested a database credential, alongside
    # sys/leases/renew, so a long-running task's lease survives past its
    # original TTL — found live (a deliberately short test TTL) that
    # renew-accessor was never granted, since nothing needed it before
    # this wave; sys/leases/renew alone is not sufficient (see
    # backend/src/vault.js's renewTokenByAccessor comment for why).
    path "auth/token/renew-accessor" {
      capabilities = ["update"]
    }

    # Required so factory-api can mint the short-lived, factory_agent=agent-c
    # -tagged child token scoped to specific role policies.
    path "auth/token/create" {
      capabilities = ["create", "update"]
    }

    # prompts/improvements/01_07_vault_kv_secrets_migration.md: the four
    # static secrets factory-api itself consumes (agent bearer tokens for
    # validating incoming requests, its own JWT signing secret, the CLI
    # operator token, the OIDC client secret) — read only, exactly these
    # four paths, nothing broader under secret/.
    path "secret/data/agents/bearer-tokens" {
      capabilities = ["read"]
    }

    path "secret/data/backend/jwt-signing-secret" {
      capabilities = ["read"]
    }

    path "secret/data/backend/cli-operator-token" {
      capabilities = ["read"]
    }

    path "secret/data/identity/oidc-client-secret" {
      capabilities = ["read"]
    }

    # prompts/v3/03_01: factory-api's own v3 demo token-issuer signing
    # key (terraform/vault-secrets' v3_jwt_signing_key) — read only,
    # same pattern as every other static secret above.
    path "secret/data/backend/v3-jwt-signing-key" {
      capabilities = ["read"]
    }
  EOT
}

# Narrow child-token policy for Agent C credential issuance
resource "vault_policy" "factory_agent_c_cred" {
  namespace = vault_namespace.factory.path
  name      = "factory-agent-c-cred"
  policy    = <<-EOT
    path "database/creds/factory-bad-role" {
      capabilities = ["read"]
    }

    path "database/creds/factory-good-role" {
      capabilities = ["read"]
    }
  EOT
}

# prompts/improvements/01_07_vault_kv_secrets_migration.md — a separate
# identity from factory-api's own, for OpenLDAP's and Keycloak's own
# bootstrap secrets. Different trust domain (a third-party container's
# own admin password, not an application-broker credential), so a
# separate AppRole + policy, not a wider grant tacked onto factory-api's
# — matching this project's own established pattern of distinct security
# domains for human/agent/CLI-operator identity.
resource "vault_policy" "identity_secrets" {
  namespace = vault_namespace.factory.path
  name      = "identity-secrets"
  policy    = <<-EOT
    path "secret/data/identity/ldap-admin-password" {
      capabilities = ["read"]
    }

    path "secret/data/identity/keycloak-admin-password" {
      capabilities = ["read"]
    }

    path "secret/data/identity/oidc-client-secret" {
      capabilities = ["read"]
    }
  EOT
}

# prompts/v3/03_01: the 03_00 spike's own throwaway
# agentic-iam-spike-baseline policy (its live-testing role now fully
# superseded by v3-root-credential-path.tf's real v3-agent-baseline)
# was torn down here, along with the spike's root entity, its aliases,
# its Agent Registry registration, and the agentic-iam-spike /
# agentic-iam-spike-clean / factory-spike oauth-resource-server
# profiles — see prompts/v3/03_01_v3_root_credential_path.md Phase 2.

# prompts/improvements/01_06_vault_root_token_elimination.md — the one
# token routine Vault administration should ever need after initial
# bootstrap, replacing the literal cluster root token for every
# subsequent `terraform apply` and the entitlement check.
#
# Deliberately homed in the ROOT namespace (no `namespace` argument here)
# rather than inside `factory`, and reaches into `factory` via
# namespace-prefixed paths below — confirmed live before writing this
# that a root-homed token's policy can grant access to
# "<child-namespace>/<path>" and that `-namespace=<child>` then honors it
# exactly like a native child-namespace token for those specific paths.
# This is what lets ONE token cover both `sys/namespaces/factory` (a
# root-namespace-only path — namespaces are managed from their parent)
# and every factory-scoped resource this project's own Terraform stacks
# manage, without needing two separate tokens.
#
# Every path below, and whether it needs `sudo`, was verified live by
# minting a real scoped token and testing it directly against the running
# cluster — not assumed from documentation. Only `sys/auth/*` (mounting an
# auth backend) required `sudo`; mounting a secrets engine, writing an
# EGP, writing an ACL policy, and creating a namespace all worked with
# plain CRUD capabilities in this Vault Enterprise version. Do not add
# `sudo` elsewhere without re-verifying live first.
resource "vault_policy" "vault_admin" {
  name   = "vault-admin"
  policy = <<-EOT
    path "sys/namespaces/factory" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "sys/policies/egp/protect-audit-devices" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "sys/license/status" {
      capabilities = ["read"]
    }

    # prompts/v2/02_09: scripts/vault-audit-crosscheck.py's first real
    # Vault API dependency — independently confirms a lease the app
    # marked revoked is genuinely gone from Vault's own lease store,
    # rather than only trusting dag_node_attempts.authority_status.
    # sys/leases/lookup takes lease_id in the request body, which Vault's
    # ACL model treats as an "update" operation, not "read", despite the
    # name.
    path "factory/sys/leases/lookup" {
      capabilities = ["update"]
    }

    # prompts/v3/03_00: the v3 prework spike — configuring an OAuth
    # Resource Server profile (Vault's native Agentic IAM / AI-agent
    # identity feature) needs `sudo`, confirmed live from this path's own
    # OpenAPI spec entry (`x-vault-sudo: true`), not assumed. Narrowly
    # scoped to this one config tree, not a blanket sudo grant — see the
    # comment above `factory/sys/auth/approle` for why sudo elsewhere on
    # this policy needs the same live-verify-first discipline.
    path "factory/sys/config/oauth-resource-server/*" {
      capabilities = ["create", "read", "update", "delete", "list", "sudo"]
    }

    # prompts/v3/03_00 retest: Agent Registry — confirmed live to be a
    # root-namespace-only built-in (absent from factory's own
    # sys/mounts listing; a request scoped to the factory namespace
    # returns "permission denied" even with this grant in place, while
    # the identical request at root returns "entityId does not exist"
    # instead — the clean way to tell "wrong namespace" apart from
    # "missing capability" here). Root-homed here, not under factory/,
    # for that reason. sys/capabilities-self against
    # agent-registry/register confirmed a bare "deny" for vault-admin
    # before this grant existed — nothing implicit covered it.
    path "agent-registry/*" {
      capabilities = ["create", "read", "update", "delete", "list"]
    }

    # prompts/v3/03_01: the real v3 credential path's own policy
    # (terraform/vault-platform/v3-root-credential-path.tf) — same
    # routine management grant as every other named policy in this
    # file, root-scoped since v3-agent-baseline is a root-homed policy.
    path "sys/policies/acl/v3-agent-baseline" {
      capabilities = ["create", "read", "update", "delete"]
    }

    # prompts/v3/03_02: v3-obo-human.tf's own policy — same grant as
    # v3-agent-baseline just above, for the human side of OBO
    # delegation.
    path "sys/policies/acl/v3-human-baseline" {
      capabilities = ["create", "read", "update", "delete"]
    }

    # Same retest: the entity Agent Registry's entity_id must reference
    # has to live in the SAME (root) namespace as the registry itself —
    # a factory-namespace entity gets "specified entityId does not
    # exist" when registered from root. vault-admin only had
    # factory/identity/entity before now, never the root-scoped path.
    path "identity/entity" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "identity/entity/id/*" {
      capabilities = ["create", "read", "update", "delete"]
    }

    # prompts/v3/03_00 retest, found via the official setup-agent
    # tutorial (developer.hashicorp.com/vault/ai/iam/setup-agent): an
    # OAuth-resource-server-authenticated request only resolves to an
    # entity's own attached policies through an identity/entity-alias
    # bound to a Vault-synthesized mount accessor
    # (oauth-resource-server_<namespace_id>_<config_id>) — entity_id
    # alone (what Agent Registry itself requires) is not sufficient for
    # ACL resolution. Root-scoped for the same reason as
    # identity/entity above: the entity lives at root.
    path "identity/entity-alias" {
      capabilities = ["create", "read", "update", "delete"]
    }

    # prompts/v3/03_00 retest, continued: identity/entity-alias creation
    # for an OAuth-resource-server-derived identity does its own
    # internal lookup for a matching oauth-resource-server profile BY
    # ISSUER, scoped to the namespace the alias itself is created in.
    # Our entity/alias live at root (Agent Registry's own hard
    # constraint — see the agent-registry/* comment above), but this
    # spike's original profile lives in factory/, so that lookup fails
    # ("oauth config not found for <issuer>") even though the identical
    # profile is reachable, just in the wrong namespace. The official
    # setup-agent tutorial's own reference example is entirely
    # root-scoped for exactly this reason. A duplicate profile at root
    # closes the gap for this spike; does not touch the original
    # factory-scoped one.
    path "sys/config/oauth-resource-server/*" {
      capabilities = ["create", "read", "update", "delete", "list", "sudo"]
    }

    # prompts/v3/03_01: the separate root-namespace database secrets
    # engine (terraform/vault-database/database-v3.tf) — same routine
    # CRUD shape as factory/sys/mounts/database and its own role/config
    # grants below, just root-scoped since this mount deliberately
    # lives outside factory/ (see database-v3.tf's own header comment
    # for why).
    path "sys/mounts/database-v3" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "database-v3/config/*" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "database-v3/roles/v3-root-role" {
      capabilities = ["create", "read", "update", "delete"]
    }

    # Found live applying terraform/vault-sentinel with this token: the
    # Vault Terraform provider itself creates a short-lived, limited
    # child token internally for at least the vault_egp_policy resource
    # type, in whatever namespace that resource's own apply is scoped to
    # — a provider-level mechanism, not something a resource's own HCL
    # controls. Root-scoped here to cover the provider's root-namespace
    # calls (e.g. protect-audit-devices); factory/auth/token/create below
    # covers its factory-namespace calls (e.g.
    # require-agent-c-for-db-creds).
    path "auth/token/create" {
      capabilities = ["create", "update"]
    }

    path "factory/auth/token/create" {
      capabilities = ["create", "update"]
    }

    path "factory/sys/auth/approle" {
      capabilities = ["create", "read", "update", "delete", "sudo"]
    }

    # Found live on a from-scratch rebuild: AppRole's role-id and
    # secret-id are separate sub-paths under the role, not covered by a
    # grant on the exact role path alone (needed to generate a fresh
    # secret_id during bootstrap, per docs/getting-started.md).
    path "factory/auth/approle/role/factory-api" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/auth/approle/role/factory-api/*" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/sys/policies/acl/factory-api" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/sys/policies/acl/factory-agent-c-cred" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/sys/policies/egp/require-agent-c-for-db-creds" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/sys/mounts/database" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/database/config/factory-postgres" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/database/roles/factory-bad-role" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/database/roles/factory-good-role" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/database/roles/factory-backend-role" {
      capabilities = ["create", "read", "update", "delete"]
    }

    # prompts/improvements/01_07_vault_kv_secrets_migration.md: managing
    # the new secret/ KV v2 mount (terraform/vault-secrets) and the
    # identity-secrets AppRole role, the same way vault-admin already
    # manages every other routine Terraform-applied resource in this
    # namespace.
    path "factory/sys/mounts/secret" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/auth/approle/role/identity-secrets" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/auth/approle/role/identity-secrets/*" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/sys/policies/acl/identity-secrets" {
      capabilities = ["create", "read", "update", "delete"]
    }

    # Writing the actual secret values (terraform/vault-secrets' own
    # vault_kv_secret_v2 resources) — read+write, not sudo; a KV v2 data
    # path is an ordinary secrets-engine path, not a sys/ path.
    path "factory/secret/data/*" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/secret/metadata/*" {
      capabilities = ["read", "list", "delete"]
    }

    # Vault posture audit (2026-09-22): the mount-level KV v2 config
    # itself (max_versions, cas_required) — a distinct path from the
    # per-secret metadata paths above.
    path "factory/secret/config" {
      capabilities = ["read", "update"]
    }

    # prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 4:
    # the identity group + entity a human authorizer's own AppRole login
    # aliases into, and the new supervised policy/AppRole for the
    # anomaly-triggered Control Group path — managed the same routine way
    # as every other resource above.
    path "factory/identity/entity" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/identity/entity/name/*" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/identity/entity-alias" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/identity/group" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/identity/group/name/*" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/auth/approle/role/control-group-authorizer" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/auth/approle/role/control-group-authorizer/*" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/sys/policies/acl/control-group-authorizer" {
      capabilities = ["create", "read", "update", "delete"]
    }

    path "factory/sys/policies/acl/factory-agent-c-cred-supervised" {
      capabilities = ["create", "read", "update", "delete"]
    }
  EOT
}
