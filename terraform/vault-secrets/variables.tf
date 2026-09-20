variable "vault_addr" {
  description = "Vault API address"
  type        = string
  default     = "https://127.0.0.1:18200"
}

variable "vault_cacert" {
  description = "Path to the Vault CA certificate"
  type        = string
  default     = "../../vault-tls/ca-chain.pem"
}

variable "agent_a_token" {
  description = "Agent A's bearer token for agent -> backend calls"
  type        = string
  sensitive   = true
}

variable "agent_b_token" {
  description = "Agent B's bearer token for agent -> backend calls"
  type        = string
  sensitive   = true
}

variable "agent_c_token" {
  description = "Agent C's bearer token for agent -> backend calls"
  type        = string
  sensitive   = true
}

variable "agent_d_token" {
  description = "Agent D's bearer token for agent -> backend calls"
  type        = string
  sensitive   = true
}

variable "jwt_signing_secret" {
  description = "Signs/verifies the short-lived, task-bound agent JWT"
  type        = string
  sensitive   = true
}

variable "cli_operator_token" {
  description = "Shared secret for the documented CLI workflow (make demo-bad/demo-good/reset)"
  type        = string
  sensitive   = true
}

variable "oidc_client_secret" {
  description = "Keycloak OIDC confidential client secret for factory-api"
  type        = string
  sensitive   = true
}

variable "ldap_admin_password" {
  description = "OpenLDAP admin bind password"
  type        = string
  sensitive   = true
}

variable "keycloak_admin_password" {
  description = "Keycloak bootstrap admin password"
  type        = string
  sensitive   = true
}
