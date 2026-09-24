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

# prompts/v3/03_01: the v3 credential path's own demo token issuer —
# a real RSA keypair (.secrets/vault/v3-jwt-signing-key.pem, gitignored)
# factory-api uses to mint spec-clean RFC 9068 JWTs, since no IdP in
# this stack can produce one (confirmed live: Keycloak 26.6.4 always
# adds a legacy typ claim to the token body that no protocol mapper can
# override — see prompts/v3/03_00_findings.md). This stands in for a
# real external IdP; Vault still performs real signature verification
# and real Agent Registry/RAR/ACL evaluation against it.
variable "v3_jwt_signing_key" {
  description = "PEM private key factory-api uses to mint v3 demo OAuth JWTs"
  type        = string
  sensitive   = true
}
