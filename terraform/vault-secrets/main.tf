# terraform/vault-secrets — prompts/improvements/01_07_vault_kv_secrets_migration.md
#
# The KV v2 mount for this project's static secrets (per-agent bearer
# tokens, the JWT signing secret, the CLI operator token, and the two
# identity-service bootstrap passwords) — everything else these secrets
# need (who is allowed to read them) is defined in terraform/vault-platform
# alongside every other policy, not here; this stack only owns the mount
# and the secret values themselves. Applied with the narrow vault-admin
# token (prompts/improvements/01_06_vault_root_token_elimination.md), not
# root, like every other routine Terraform apply in this project.

terraform {
  required_version = ">= 1.6"
  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "~> 4.0"
    }
  }
  backend "local" {
    path = "../../.secrets/terraform/vault-secrets.tfstate"
  }
}

provider "vault" {
  address         = var.vault_addr
  # Token supplied via VAULT_TOKEN env var (.secrets/vault/vault-admin-token)
  skip_tls_verify = false
  ca_cert_file    = var.vault_cacert
  namespace       = "factory"
}

resource "vault_mount" "secret" {
  path        = "secret"
  type        = "kv-v2"
  description = "Static secrets migrated out of .env (prompts/improvements/01_07)"
}
