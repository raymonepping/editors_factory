terraform {
  required_version = ">= 1.6"
  required_providers {
    vault = {
      source  = "hashicorp/vault"
      # prompts/v3/03_01: tried bumping to ~> 5.10 for the new
      # vault_oauth_resource_server_config_profile /
      # vault_agent_registration resource types — reverted after a
      # live `terraform plan` showed it changes how the provider
      # addresses EXISTING namespace-scoped resources
      # (vault_auth_backend.approle, vault_identity_entity.
      # control_group_authorizer, even this module's own
      # vault_policy.vault_admin self-read all failed 403 on refresh,
      # despite none of them changing) — real risk to already-working
      # v1/v2 infrastructure for the sake of two new resources.
      # Staying on 4.x; the new oauth-resource-server/agent-registry
      # config is managed via vault_generic_endpoint instead (see
      # v3-root-credential-path.tf), which needs no provider bump.
      version = "~> 4.0"
    }
  }
  backend "local" {
    path = "../../.secrets/terraform/vault-platform.tfstate"
  }
}

provider "vault" {
  address         = var.vault_addr
  # Token supplied via VAULT_TOKEN env var (from .secrets/vault/cluster-init.json).
  skip_tls_verify = false
  ca_cert_file    = var.vault_cacert
}
