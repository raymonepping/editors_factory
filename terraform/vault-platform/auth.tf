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
  token_policies = [vault_policy.factory_api.name, vault_policy.factory_agent_c_cred.name]
  token_ttl      = 3600  # 1h — independent of the DB dynamic-cred TTLs
  token_max_ttl  = 14400 # 4h

  # prompts/improvements/01_04_vault_hardening.md, Item 3: this was the one
  # standing, unrotated bearer credential authenticating to Vault itself —
  # every other credential in this system is short-lived by design. Bounded
  # to 90 days rather than left non-expiring. Deliberately NOT setting
  # secret_id_num_uses: Vault Agent re-authenticates with the same
  # persisted secret_id file (compose/vault/vault-agent/config.hcl's
  # remove_secret_id_file_after_reading = false) on every container
  # restart, so a use limit would eventually and silently lock the API out
  # of Vault after enough restarts, with no rotation path in this repo to
  # recover from that automatically. See docs/getting-started.md's
  # "Bootstrap Vault" section for the regeneration step, to be run again
  # before this TTL expires.
  secret_id_ttl = 7776000 # 90 days, seconds
}
