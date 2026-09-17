# Enable the Database secrets engine, inside the factory namespace.
resource "vault_mount" "database" {
  namespace = "factory"
  path      = "database"
  type      = "database"
}

# Configure the PostgreSQL connection. Vault stores the management
# credentials internally — no application code ever sees them. The
# connection_url uses Vault's template syntax so the password is never
# written to Terraform state in plaintext.
resource "vault_database_secret_backend_connection" "postgres" {
  namespace     = "factory"
  backend       = vault_mount.database.path
  name          = "factory-postgres"
  allowed_roles = ["factory-bad-role", "factory-good-role", "factory-backend-role"]

  postgresql {
    connection_url = "postgresql://{{username}}:{{password}}@${var.postgres_host}:${var.postgres_port}/${var.postgres_db}?sslmode=disable"
    username       = var.postgres_user
    password       = var.postgres_password
  }
}

# BAD profile — over-broad DML, long TTL. This fixed, over-broad binding
# IS the demonstrated flaw (security/authority-model.md). Deliberately
# NO DROP/TRUNCATE/DDL privileges — the BAD-mode damage stays
# over-privileged DML, not schema destruction
# (prompts/base_project/03_01_postgres_dynamic_creds.md's own Non-goals).
resource "vault_database_secret_backend_role" "factory_bad_role" {
  namespace = "factory"
  backend   = vault_mount.database.path
  name      = "factory-bad-role"
  db_name   = vault_database_secret_backend_connection.postgres.name

  # Statements combined into one array element (semicolon/newline
  # separated), matching Vault's own PostgreSQL secrets engine docs
  # example — a reasonable, harmless convention, but NOT actually the fix
  # for the real bug found here (see factory_good_role's own comment
  # below for the real root cause and the actual fix: column-level GRANT
  # syntax, not statement-array shape).
  # Also grants EXECUTE on set_order_status so the backend's
  # update_order_status tool can call the same function regardless of
  # profile (backend/src/migrations/003_functions.sql) — redundant with
  # bad-role's own broad table-level UPDATE, but keeps the tool
  # implementation identical in both profiles, which is itself part of
  # this project's whole point (prompts/api/01_01_factory_schema_and_tools.md:
  # "GOOD mode's protection is the policy engine plus the grants, not a
  # different code path").
  creation_statements = [
    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';\nGRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";\nGRANT EXECUTE ON FUNCTION set_order_status(integer, text) TO \"{{name}}\";\nGRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"{{name}}\";",
  ]

  revocation_statements = [
    "REASSIGN OWNED BY \"{{name}}\" TO \"${var.postgres_user}\";\nDROP OWNED BY \"{{name}}\";\nDROP ROLE IF EXISTS \"{{name}}\";",
  ]

  default_ttl = "86400" # 24h
  max_ttl     = "86400" # 24h
}

# GOOD profile — SELECT everywhere, status-only order updates via a
# function (see below), short TTL. No DELETE, no unrestricted UPDATE,
# anywhere. This is what turns Agent C's DELETE attempt into a real
# PostgreSQL permission error, on top of (not instead of) the backend
# policy denial and the Sentinel EGP
# (security/authority-model.md's defense-in-depth section).
#
# Found live: the originally-designed `GRANT UPDATE (status) ON orders
# TO "{{name}}"` (column-level privilege) was reliably DROPPED by
# Vault's PostgreSQL secrets engine — the credential was issued
# successfully, with no error, but the grant silently never applied.
# Reproduced consistently (5+ back-to-back attempts, 100% failure) with
# root tokens AND AppRole-derived tokens, with the statement as its own
# array element and combined into one multi-statement element, with and
# without a space before the parenthesis — always the same result: SELECT
# grants applied, the column-list UPDATE grant did not. A plain
# table-level `GRANT UPDATE ON orders` (no column list) applied reliably
# every time, isolating the column-list syntax itself as the trigger, not
# statement ordering, count, or caller identity.
#
# Worked around by not using a column-level GRANT at all: a
# SECURITY DEFINER function (backend/src/migrations/003_functions.sql,
# set_order_status(id, status)) that updates only the status column,
# with EXECUTE granted per-role like any other ordinary grant (a
# different, working grant form — `GRANT EXECUTE ON FUNCTION ...` has no
# column-list syntax to trip over). Table-level UPDATE on orders is
# deliberately NOT granted to factory-good-role at all — the function is
# the only path, which is a strictly narrower and more auditable
# surface than a column-level grant would have been anyway.
#
# References orders/set_order_status before
# prompts/api/01_01_factory_schema_and_tools.md creates them — this is
# fine: Vault only validates these SQL statements against PostgreSQL at
# actual credential-generation time, not at `terraform apply` time.
# `vault read database/creds/factory-good-role` will fail with a real
# PostgreSQL error until that schema/function exists; that failure is
# expected and informative, not a bug in this module.
resource "vault_database_secret_backend_role" "factory_good_role" {
  namespace = "factory"
  backend   = vault_mount.database.path
  name      = "factory-good-role"
  db_name   = vault_database_secret_backend_connection.postgres.name

  creation_statements = [
    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';\nGRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";\nGRANT EXECUTE ON FUNCTION set_order_status(integer, text) TO \"{{name}}\";\nGRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"{{name}}\";",
  ]

  revocation_statements = [
    "REASSIGN OWNED BY \"{{name}}\" TO \"${var.postgres_user}\";\nDROP OWNED BY \"{{name}}\";\nDROP ROLE IF EXISTS \"{{name}}\";",
  ]

  default_ttl = "120" # 2m
  max_ttl     = "120" # 2m
}

# factory-api's OWN operational credential — not part of the BAD/GOOD
# demo mechanism at all. The backend needs a real, non-static credential
# for its own evidence-table bookkeeping (audit_events, delegations,
# authority_decisions, credential_events, database_changes, findings,
# demo_runs) and for read-only product/order tool calls that any agent
# may make (list_orders, get_order, list_products) — none of that is
# Agent C's BAD/GOOD credential story, so it must not share a role with
# it. SELECT everywhere (the backend's own reads), full DML on the
# evidence tables ONLY — never products/orders/inventory, which stay
# mutable exclusively through factory-bad-role/factory-good-role,
# preserving the demo's central mechanic (real product/order mutation
# only ever happens via the credential Agent C was issued).
#
# Deliberately NOT gated by the require-agent-c-for-db-creds Sentinel EGP
# (terraform/vault-sentinel/main.tf scopes that EGP to exactly
# database/creds/factory-bad-role and database/creds/factory-good-role,
# not a database/creds/* wildcard) — this is the backend's own
# infrastructure connection, not an action taken "on agent-c's behalf,"
# and gating it the same way would be semantically wrong, not just
# inconvenient.
resource "vault_database_secret_backend_role" "factory_backend_role" {
  namespace = "factory"
  backend   = vault_mount.database.path
  name      = "factory-backend-role"
  db_name   = vault_database_secret_backend_connection.postgres.name

  # See factory_bad_role's own comment above for why this is one
  # multi-statement array element, not one element per statement.
  creation_statements = [
    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';\nGRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";\nGRANT INSERT, UPDATE, DELETE ON demo_runs, audit_events, delegations, authority_decisions, credential_events, database_changes, findings TO \"{{name}}\";\nGRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"{{name}}\";",
  ]

  revocation_statements = [
    "REASSIGN OWNED BY \"{{name}}\" TO \"${var.postgres_user}\";\nDROP OWNED BY \"{{name}}\";\nDROP ROLE IF EXISTS \"{{name}}\";",
  ]

  default_ttl = "3600"  # 1h — reissued by the backend before expiry, not lease-renewed
  max_ttl     = "14400" # 4h
}
