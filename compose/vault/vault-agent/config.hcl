# compose/vault/vault-agent/config.hcl — prompts/base_project/02_02_vault_follow_up.md
#
# Owns exactly one thing for the factory-api identity: AppRole auto-auth +
# token renewal (so the backend never hand-rolls its own login()/
# scheduleTokenRefresh() loop — the same value Vault Agent already
# provides in arcanium/compose/vault/vault-agent/config.hcl).
#
# Deliberately does NOT template-render database/creds/* to a file.
# Agent C's credential must be issued at the moment the backend actually
# brokers a request on Agent C's behalf (prompts/backend/01_01_orchestrator_api.md),
# not pre-rendered on Vault Agent's own renewal schedule — pre-rendering
# would decouple "credential exists" from "Agent C actually asked for
# it," which breaks this project's central demo narrative. The backend
# reads database/creds/* itself, using the token this file renders.

pid_file = "/tmp/pidfile"

vault {
  address   = "https://vault-1:8200"
  ca_cert   = "/vault/tls/ca-chain.pem"
  namespace = "factory"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path                   = "/tmp/role-id"
      secret_id_file_path                 = "/tmp/secret-id"
      remove_secret_id_file_after_reading = false
    }
  }

  sink "file" {
    config = {
      path = "/vault/secrets/token"
      # Same finding as arcanium's own config.hcl: the sink's `mode`
      # config did not reliably grant group-read — matching the
      # container's `user:` to factory-api's own future UID (1000:1000,
      # see compose.yaml) means the default owner-only 0600 already
      # covers it. No mode override here either.
    }
  }
}
