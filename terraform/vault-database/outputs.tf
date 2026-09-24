output "database_mount_path" {
  value = vault_mount.database.path
}

output "roles" {
  value = [
    vault_database_secret_backend_role.factory_bad_role.name,
    vault_database_secret_backend_role.factory_good_role.name,
    vault_database_secret_backend_role.factory_backend_role.name,
  ]
}

# prompts/v3/03_01 — separate root-namespace mount, kept as its own
# output rather than folded into the factory-scoped `roles` list above.
output "database_v3_mount_path" {
  value = vault_mount.database_v3.path
}

output "v3_role" {
  value = vault_database_secret_backend_role.v3_root_role.name
}
