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
  EOT
}
