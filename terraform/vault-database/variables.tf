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

variable "postgres_host" {
  description = "PostgreSQL hostname reachable from the Vault container. vault-1/2/3 live on factory-vault-internal, PostgreSQL lives on factory-control — no shared network, so Vault reaches it via the host-published port."
  type        = string
  default     = "host.containers.internal"
}

variable "postgres_port" {
  description = "PostgreSQL port"
  type        = number
  default     = 5432
}

variable "postgres_user" {
  description = "PostgreSQL management superuser (Vault uses this to manage dynamic credentials)"
  type        = string
  sensitive   = true
}

variable "postgres_password" {
  description = "PostgreSQL management password (stored in Vault, never exposed to app)"
  type        = string
  sensitive   = true
}

variable "postgres_db" {
  description = "PostgreSQL database name"
  type        = string
  default     = "factory_db"
}
