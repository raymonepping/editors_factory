# prompts/v3/03_01: a SEPARATE database secrets engine, mounted at
# Vault's ROOT namespace — not inside factory/, and not the same mount
# as database.tf's own vault_mount.database. Required by the
# root-vs-factory-namespace boundary 03_00's live spike found: Agent
# Registry (a hard prerequisite for OAuth-resource-server
# authentication) only accepts root-namespace entities, and
# entity-alias resolution is scoped to the target path's own
# namespace — so a v3 credential reachable this way must itself live
# at root. Same Postgres instance as factory/database's own connection
# (same var.postgres_host/port/db), genuinely separate Vault mount and
# role so v1/v2's factory/database/roles/factory-* are never touched by
# anything in this file.
resource "vault_mount" "database_v3" {
  path = "database-v3"
  type = "database"
}

resource "vault_database_secret_backend_connection" "postgres_v3" {
  backend       = vault_mount.database_v3.path
  name          = "factory-postgres-v3"
  allowed_roles = ["v3-root-role"]

  postgresql {
    connection_url = "postgresql://{{username}}:{{password}}@${var.postgres_host}:${var.postgres_port}/${var.postgres_db}?sslmode=disable"
    username       = var.postgres_user
    password       = var.postgres_password
  }
}

# Deliberately read-only, deliberately scoped to `products` only — not
# `orders`, not any evidence table (demo_runs, dag_*, audit_events,
# etc.), so a v3 demo run issued through this role can never touch the
# data v1/v2's own non-regression tests assert against. This role has
# no relationship to factory-bad-role/factory-good-role's BAD/GOOD
# story — it is not gated by require-agent-c-for-db-creds (that
# Sentinel EGP scopes itself to database/creds/factory-{bad,good}-role
# specifically; see terraform/vault-sentinel/main.tf), and is not
# meant to be — v3's own boundary is Vault's native RAR/ACL
# intersection instead, which is the mechanism this credential path
# exists to demonstrate.
resource "vault_database_secret_backend_role" "v3_root_role" {
  backend = vault_mount.database_v3.path
  name    = "v3-root-role"
  db_name = vault_database_secret_backend_connection.postgres_v3.name

  creation_statements = [
    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';\nGRANT SELECT ON products TO \"{{name}}\";",
  ]

  revocation_statements = [
    "REASSIGN OWNED BY \"{{name}}\" TO \"${var.postgres_user}\";\nDROP OWNED BY \"{{name}}\";\nDROP ROLE IF EXISTS \"{{name}}\";",
  ]

  default_ttl = "120" # 2m — short-lived, matches the demo-only nature of this path
  max_ttl     = "600" # 10m
}
