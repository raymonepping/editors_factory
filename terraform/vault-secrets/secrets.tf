# Field names here (agent_a, agent_b, ...) must match exactly what
# backend/src/vault.js's loadSecretsFromVault() reads.

resource "vault_kv_secret_v2" "agent_bearer_tokens" {
  mount = vault_mount.secret.path
  name  = "agents/bearer-tokens"
  data_json = jsonencode({
    agent_a = var.agent_a_token
    agent_b = var.agent_b_token
    agent_c = var.agent_c_token
    agent_d = var.agent_d_token
  })
}

resource "vault_kv_secret_v2" "jwt_signing_secret" {
  mount = vault_mount.secret.path
  name  = "backend/jwt-signing-secret"
  data_json = jsonencode({
    value = var.jwt_signing_secret
  })
}

resource "vault_kv_secret_v2" "cli_operator_token" {
  mount = vault_mount.secret.path
  name  = "backend/cli-operator-token"
  data_json = jsonencode({
    value = var.cli_operator_token
  })
}

resource "vault_kv_secret_v2" "oidc_client_secret" {
  mount = vault_mount.secret.path
  name  = "identity/oidc-client-secret"
  data_json = jsonencode({
    value = var.oidc_client_secret
  })
}

resource "vault_kv_secret_v2" "ldap_admin_password" {
  mount = vault_mount.secret.path
  name  = "identity/ldap-admin-password"
  data_json = jsonencode({
    value = var.ldap_admin_password
  })
}

resource "vault_kv_secret_v2" "keycloak_admin_password" {
  mount = vault_mount.secret.path
  name  = "identity/keycloak-admin-password"
  data_json = jsonencode({
    value = var.keycloak_admin_password
  })
}
