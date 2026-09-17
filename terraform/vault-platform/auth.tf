# ── AppRole auth method, inside the factory namespace ────────────────────────

resource "vault_auth_backend" "approle" {
  namespace = vault_namespace.factory.path
  type      = "approle"
  path      = "approle"
}

# The backend orchestrator's (factory-api) machine identity to Vault.
# Scoped exactly per prompts/backend/01_01_orchestrator_api.md: read both
# DB dynamic-credential roles, and revoke leases. Nothing else — factory-api
# never gets Transit, PKI, or any other engine access, because Factory
# doesn't use them.
resource "vault_approle_auth_backend_role" "factory_api" {
  namespace      = vault_namespace.factory.path
  backend        = vault_auth_backend.approle.path
  role_name      = "factory-api"
  token_policies = [vault_policy.factory_api.name]
  token_ttl      = 3600  # 1h — independent of the DB dynamic-cred TTLs
  token_max_ttl  = 14400 # 4h
}
