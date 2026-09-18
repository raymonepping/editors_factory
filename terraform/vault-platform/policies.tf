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
