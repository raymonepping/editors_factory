# prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 4 —
# a third, explicitly-supervised path alongside BAD/GOOD, gated by
# Vault's own Control Groups feature (confirmed entitled on this
# license via scripts/vault-check-entitlement.sh). Deliberately does
# NOT change the existing factory-agent-c-cred policy or the normal
# unattended demo-bad/demo-good flow — this is a second, narrower
# policy used only when the backend's own anomaly trigger fires.
#
# Control Groups require an *identity* factor: the token that calls
# sys/control-group/authorize must belong to a Vault entity that is a
# member of the named group. Verified live before writing this: a
# plain AppRole login has no entity relationship to any group on its
# own — an explicit vault_identity_entity + vault_identity_entity_alias
# is what makes logging in via this one AppRole role_id authenticate
# AS this specific entity, which vault_identity_group then recognizes
# as a member.
#
# The human never touches Vault directly, matching every other
# identity in this project (security/authority-model.md's "no agent
# container ever holds a Vault credential" — the same reasoning
# extends here: no human session holds one either). The backend itself
# authenticates as this authorizer identity, only at the moment a
# human clicks "Authorize" in the dashboard, using a role_id/secret_id
# pair distinct from factory-api's own routine identity.

resource "vault_policy" "control_group_authorizer" {
  namespace = vault_namespace.factory.path
  name      = "control-group-authorizer"
  policy    = <<-EOT
    path "sys/control-group/authorize" {
      capabilities = ["update"]
    }

    path "sys/control-group/request" {
      capabilities = ["update"]
    }
  EOT
}

resource "vault_approle_auth_backend_role" "control_group_authorizer" {
  namespace      = vault_namespace.factory.path
  backend        = vault_auth_backend.approle.path
  role_name      = "control-group-authorizer"
  token_policies = [vault_policy.control_group_authorizer.name]
  token_ttl      = 300
  token_max_ttl  = 600
  # secret_id_ttl (found live missing here — defaulted to 0s, i.e.
  # never expires, unlike factory-api's and identity-secrets' own 90
  # days): the TOKEN this role issues is short-lived on purpose (used
  # once, right after a human clicks Authorize), but the role_id/
  # secret_id PAIR that logs in to get that token is a standing
  # credential sitting in .env like every other AppRole pair in this
  # project, and needs the same rotation discipline, not an exemption
  # just because what it produces is short-lived.
  secret_id_ttl = 7776000 # 90 days, matching factory-api and identity-secrets
  # Short-lived on purpose — this identity is used for exactly one
  # action (authorize one pending request), immediately after a human
  # clicks a button, never held standing the way factory-api's own
  # AppRole token is.
}

resource "vault_identity_entity" "control_group_authorizer" {
  namespace = vault_namespace.factory.path
  name      = "control-group-authorizer"
}

resource "vault_identity_entity_alias" "control_group_authorizer" {
  namespace      = vault_namespace.factory.path
  name           = vault_approle_auth_backend_role.control_group_authorizer.role_id
  mount_accessor = vault_auth_backend.approle.accessor
  canonical_id   = vault_identity_entity.control_group_authorizer.id
}

resource "vault_identity_group" "control_group_approvers" {
  namespace         = vault_namespace.factory.path
  name              = "control-group-approvers"
  member_entity_ids = [vault_identity_entity.control_group_authorizer.id]
}

# The gated policy itself — a copy of factory_agent_c_cred's own read
# grant on the two agent-c database roles, with a control_group block
# added. factory-api's own AppRole role (auth.tf) must hold this policy
# too, for the same "child policies must be subset of parent" reason it
# already holds factory_agent_c_cred — verified live before writing
# that comment there.
resource "vault_policy" "factory_agent_c_cred_supervised" {
  namespace = vault_namespace.factory.path
  name      = "factory-agent-c-cred-supervised"
  policy    = <<-EOT
    path "database/creds/factory-bad-role" {
      capabilities = ["read"]
      control_group = {
        factor "human_review" {
          identity {
            group_names = ["control-group-approvers"]
            approvals   = 1
          }
        }
      }
    }

    path "database/creds/factory-good-role" {
      capabilities = ["read"]
      control_group = {
        factor "human_review" {
          identity {
            group_names = ["control-group-approvers"]
            approvals   = 1
          }
        }
      }
    }
  EOT
}

output "control_group_authorizer_role_id" {
  value = vault_approle_auth_backend_role.control_group_authorizer.role_id
}
