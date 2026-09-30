# ── AppRole auth method, inside the factory namespace ────────────────────────

resource "vault_auth_backend" "approle" {
  namespace = vault_namespace.factory.path
  type      = "approle"
  path      = "approle"

  # AppRole caps every secret-id (and token) at the mount's effective
  # max_lease_ttl. Untuned, that is the server-wide max_lease_ttl in
  # vault-*/config*.hcl — 168h — so every role's `secret_id_ttl = 7776000`
  # (90 days) silently became 7 days. Found live 2026-09-30: identity-secrets
  # and control-group-authorizer secret-ids both dead after a week
  # (identity-secrets-init 403 on login; Control Group approvals 400).
  # Raising the ceiling on this mount only — not the server-wide value —
  # keeps every other mount's 7-day maximum. Roles still set their own,
  # shorter token TTLs; this only stops the mount from overriding them.
  tune {
    default_lease_ttl = "1h"
    max_lease_ttl     = "2160h" # 90 days = the secret_id_ttl every role declares
  }
}

# The backend orchestrator's (factory-api) machine identity to Vault.
# Scoped exactly per prompts/backend/01_01_orchestrator_api.md: read both
# DB dynamic-credential roles, and revoke leases. Nothing else — factory-api
# never gets Transit, PKI, or any other engine access, because Factory
# doesn't use them.
resource "vault_approle_auth_backend_role" "factory_api" {
  namespace = vault_namespace.factory.path
  backend   = vault_auth_backend.approle.path
  role_name = "factory-api"
  # factory_agent_c_cred_supervised (01_08 Phase 4): Vault requires a
  # child token's policies to be a subset of its parent's — found live,
  # "child policies must be subset of parent" — so factory-api's own
  # token must hold this too, the same structural reason it already
  # holds factory_agent_c_cred. factory-api's own token is never used
  # directly to read database/creds/*, only to mint a scoped-down child
  # token first, and the supervised policy is itself gated further by a
  # Control Group — holding it here does not widen what factory-api can
  # do unsupervised.
  token_policies = [
    vault_policy.factory_api.name,
    vault_policy.factory_agent_c_cred.name,
    vault_policy.factory_agent_c_cred_supervised.name,
  ]
  token_ttl     = 3600  # 1h — independent of the DB dynamic-cred TTLs
  token_max_ttl = 86400 # 24h (prompts/hardening/01_00, was 4h)
  # Governs vault-agent's own long-running renewing identity token, not
  # any per-task child token TTL (those are minted separately, short-
  # lived, by mintAgentTaggedChildToken — unrelated to this ceiling).
  # Not a fix for the renewal-loop reliability gap Phase 1/2 address
  # (documented upstream Vault Agent behavior — see CLAUDE.md gotcha
  # #9), but real risk reduction: 24h covers a full unattended demo
  # session, quartering how often a full renewal-to-reauth cycle must
  # complete without hitting whatever triggers it.

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

# prompts/improvements/01_07_vault_kv_secrets_migration.md: a separate
# machine identity for the identity-secrets Vault Agent sidecar that
# renders OpenLDAP's and Keycloak's own bootstrap passwords — not
# factory-api's AppRole, see that policy's own comment for why.
resource "vault_approle_auth_backend_role" "identity_secrets" {
  namespace      = vault_namespace.factory.path
  backend        = vault_auth_backend.approle.path
  role_name      = "identity-secrets"
  token_policies = [vault_policy.identity_secrets.name]
  token_ttl      = 3600
  token_max_ttl  = 14400
  secret_id_ttl  = 7776000 # 90 days, same rotation discipline as factory-api's own
}

# prompts/hardening/03_00_vault_agent_sidecar.md: AppRole for the rotator sidecar.
# Holds approle-rotator policy. Uses periodic token so it can run indefinitely.
resource "vault_approle_auth_backend_role" "approle_rotator" {
  namespace      = vault_namespace.factory.path
  backend        = vault_auth_backend.approle.path
  role_name      = "approle-rotator"
  token_policies = [vault_policy.approle_rotator.name]
  token_ttl      = 3600
  token_max_ttl  = 86400
  token_period   = 86400
  secret_id_ttl  = 0 # Rotator's own identity secret-id is static or seeded on deploy
}
