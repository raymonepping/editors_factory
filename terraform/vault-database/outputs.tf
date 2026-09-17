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
