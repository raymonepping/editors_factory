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

    # Found live: src/vault.js's revokeLease() calls the bare
    # `PUT sys/leases/revoke` endpoint with lease_id in the request body
    # (the standard, documented form) — that path does NOT match a
    # "sys/leases/revoke/*" glob (no trailing path segment to match
    # against), so the wildcard-only grant below denied every revoke
    # with a 403 despite looking identical in the policy source. Both
    # forms granted now: the exact bare path this code actually calls,
    # and the wildcard form in case a future revoke-by-path-suffix call
    # is ever added.
    path "sys/leases/revoke" {
      capabilities = ["update"]
    }

    path "sys/leases/revoke/*" {
      capabilities = ["update"]
    }

    # Required so factory-api can mint the short-lived, factory_agent=agent-c
    # -tagged child token that prompts/backend/01_01_orchestrator_api.md's
    # credential-broker flow uses for database/creds/* reads — the
    # require-agent-c-for-db-creds Sentinel EGP checks token.metadata,
    # which is set at token-creation time, not per-request (Sentinel's
    # request object has no HTTP-header access — see
    # terraform/vault-sentinel/main.tf's own comment for what was tried
    # and ruled out first). A child token created this way inherits
    # factory-api's own policies by default — this grant does not widen
    # what the child token can do, only lets factory-api create it.
    path "auth/token/create" {
      capabilities = ["create", "update"]
    }
  EOT
}
