# prompts/v3/03_02 — the human side of OBO delegation. A genuinely
# separate identity from v3-agent-identity (v3-root-credential-path.tf),
# not a variant of it: HashiCorp's on-behalf-of model intersects the
# agent's own ceiling policy with the human's own independently
# evaluated baseline ACL policy, so this has to be a real, separate
# Vault entity with its own real policy, not a second alias on the
# agent's identity.
#
# Deliberately granted the SAME path v3-agent-baseline already covers
# (database-v3/creds/v3-root-role read), not a broader or different
# one — the point of this phase is proving the human's own policy is
# genuinely, independently evaluated as part of the intersection, not
# exercising a new target. 03_02's own Phase 5 negative control (this
# policy temporarily NOT granting the path, live-tested, then restored)
# is what actually proves that, not the choice of path.
resource "vault_identity_entity" "v3_human" {
  name     = "v3-human-identity"
  policies = [vault_policy.v3_human_baseline.name]
}

resource "vault_policy" "v3_human_baseline" {
  name   = "v3-human-baseline"
  policy = <<-EOT
    path "database-v3/creds/v3-root-role" {
      capabilities = ["read"]
    }
  EOT
}
