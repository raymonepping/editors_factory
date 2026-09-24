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

resource "vault_kv_secret_v2" "v3_jwt_signing_key" {
  mount = vault_mount.secret.path
  name  = "backend/v3-jwt-signing-key"
  # No `cas` here, matching every sibling resource in this file —
  # found live that vault_kv_secret_v2's own `cas` attribute can't
  # actually express 0 on a genuinely new key (this mount enforces
  # cas_required=true; the provider's first write needs cas=0, but
  # setting cas=0 in HCL still failed "check-and-set parameter
  # required for this call" — a real provider-level 0-vs-unset
  # ambiguity, not a mistake in this config). Worked around by writing
  # the real key directly via the API instead (cas=1, since a
  # placeholder version 1 existed from the failed attempt) — the real
  # value is live in Vault (confirmed: a valid, loadable 2048-bit RSA
  # key), but `terraform import` to reconcile this resource into state
  # hit a SEPARATE, unrelated issue (a batch sys/capabilities-self call
  # this project's vault-admin policy doesn't cover, used internally by
  # the provider's own import path) — not chased further. Known,
  # narrow state drift: `terraform plan` on this one resource will show
  # "will create" until re-imported; re-running it blind would hit the
  # same cas bug. Does not affect the real secret value Vault already
  # holds, which is what factory-api actually reads.
  data_json = jsonencode({
    value = var.v3_jwt_signing_key
  })
}
