# prompts/v3/03_01 — the real, formalized version of what 03_00's
# spike proved live with throwaway curl calls. Every resource here is
# root-namespace (no `namespace` argument), per the hard boundary
# 03_00 found: Agent Registry only accepts root entities, and
# entity-alias resolution is scoped to the target path's own
# namespace — so an entity satisfying both constraints can only exist
# for a root-namespace target, which is exactly what
# terraform/vault-database/database-v3.tf provides.
#
# sys/config/oauth-resource-server and agent-registry/register have no
# dedicated resource type on the pinned provider (v4.x) — added in
# v5.10.0, but v5 changes how the provider addresses several of this
# project's EXISTING namespace-scoped resources (found live: a plain
# `terraform plan` after bumping to ~> 5.10 threw fresh 403s on
# vault_auth_backend.approle and vault_identity_entity.
# control_group_authorizer, neither of which changed) — real risk to
# already-working v1/v2 infrastructure not worth taking for two new
# resource types. vault_generic_endpoint (stable on v4.x) manages both
# instead.

# The v3 demo token issuer's public key — factory-api holds the
# matching private key (Vault KV, terraform/vault-secrets'
# v3_jwt_signing_key) and uses it to mint spec-clean RFC 9068 JWTs,
# standing in for a real external IdP (see database-v3.tf and this
# project's prompts/v3/03_01_v3_root_credential_path.md Phase 4 for
# why — no IdP in this stack, Keycloak included, can currently produce
# a Vault-acceptable token).
locals {
  v3_jwt_issuer  = "https://factory-api.local/v3-demo-issuer"
  v3_jwt_subject = "factory-agent-c-v3"
}

resource "vault_generic_endpoint" "v3_oauth_profile" {
  path                 = "sys/config/oauth-resource-server/v3-agent"
  ignore_absent_fields = true
  data_json = jsonencode({
    issuer_id = local.v3_jwt_issuer
    use_jwks  = false
    public_keys = [
      {
        key_id = "v3-jwt-signing-key-1"
        pem    = trimspace(file("${path.module}/../../.secrets/vault/v3-jwt-signing-key.pub.pem"))
      },
    ]
    audiences                      = ["v3-agent"]
    jwt_type                       = "access_token"
    user_claim                     = "sub"
    unique_id_claim                = "jti"
    supported_algorithms           = ["RS256"]
    clock_skew_leeway              = 0
    no_default_policy              = false
    optional_authorization_details = false
    actor_claim                    = "act.sub"
  })
}

resource "vault_identity_entity" "v3_agent" {
  name     = "v3-agent-identity"
  policies = [vault_policy.v3_agent_baseline.name]
}

# agent-registry/register and identity/entity-alias are NOT managed
# here via vault_generic_endpoint, unlike the profile above — found
# live that both are POST-only paths with no matching GET (405
# "unsupported operation" reading them back), and this provider
# version's `disable_read` doesn't help: `terraform import`'s own
# refresh step reads unconditionally regardless of that setting,
# before the resource's config is even consulted, so a state entry for
# either can never be established cleanly. Rather than fight the
# provider, these two writes live in
# scripts/vault-v3-agent-registry-bootstrap.sh instead — a small,
# idempotent script in the same spirit as
# scripts/vault-secrets-bootstrap.sh, which already manages values
# Terraform can't cleanly own. Both objects are real and live (created
# 2026-09-24, entity_id c11271fa-607b-babc-b720-d7f8f621d3fe,
# registration id 464415c4-d6b9-1f64-fcaa-359c7d8a5a02, alias id
# 821e7cfa-b1d8-aeec-8177-25078d538da4) — this comment documents intent
# for the next session, not a pending action.

# Phase 3: narrowly scoped to exactly the new root-scoped database
# role — nothing else. Both the entity's own `policies` (above) and
# the Agent Registry entry's `ceiling_policies` point here; 03_00's
# spike proved either alone is insufficient — Vault's RAR model
# intersects entity policy, ceiling policy, and the token's own
# authorization_details claim, all three.
resource "vault_policy" "v3_agent_baseline" {
  name   = "v3-agent-baseline"
  policy = <<-EOT
    path "database-v3/creds/v3-root-role" {
      capabilities = ["read"]
    }
  EOT
}
