# terraform/vault-sentinel/ — prompts/base_project/02_02_vault_follow_up.md
#
# Sentinel EGPs (endpoint governing policies) — Vault becomes a policy
# enforcement point for the factory-api credential-broker flow, not only
# a credential source. Requires the "Sentinel" license feature (present —
# verified with scripts/vault-check-entitlement.sh "Sentinel").
#
# Both EGPs below are scoped to the factory namespace
# (terraform/vault-platform/), matching where the paths they guard
# actually live.

terraform {
  required_version = ">= 1.6"
  required_providers {
    vault = { source = "hashicorp/vault", version = "~> 4.0" }
  }
  backend "local" {
    path = "../../.secrets/terraform/vault-sentinel.tfstate"
  }
}

provider "vault" {
  address      = var.vault_addr
  ca_cert_file = var.vault_cacert
}

# Every database/creds/* request must be made with a token explicitly
# tagged as acting on agent-c's behalf. This holds independent of, and in
# addition to, the backend's own policy.js ALLOW/DENY engine
# (prompts/backend/01_01_orchestrator_api.md) and the factory-good-role
# PostgreSQL grants (prompts/base_project/03_01_postgres_dynamic_creds.md)
# — a third defense-in-depth layer that holds even if the backend's own
# policy code has a bug. Only agent-c is ever meant to hold a database
# credential (prompts/agents/04_01_agent_c_remediation.md); this makes
# that an enforced Vault invariant, not merely an application convention.
#
# CORRECTED design (found live): Sentinel's `request` object in Vault
# Enterprise does NOT expose HTTP headers — `request.headers` does not
# exist (confirmed against current Sentinel properties documentation
# after `request.headers[...]` produced "only a list or map can be
# indexed, got undefined" for every request, header present or not).
# `database/creds/*` is also read-only (GET) — a write/update carrying
# body data is rejected with "unsupported operation", so `request.data`
# is not an option either. The mechanism that actually works: Sentinel
# CAN inspect `token.metadata` (confirmed: type `map (string -> string)`,
# "Metadata set on the token"). The backend must therefore create a
# short-lived CHILD TOKEN (`vault token create -orphan=false
# -metadata=factory_agent=agent-c -ttl=60s`, using its own
# already-authenticated factory-api token as parent — a single fast
# Vault call, not a full AppRole re-authentication) and use that child
# token specifically for the database/creds/* read. See
# prompts/backend/01_01_orchestrator_api.md for the corrected flow.
resource "vault_egp_policy" "require_agent_c_for_db_creds" {
  namespace = "factory"
  name      = "require-agent-c-for-db-creds"
  # Deliberately the two agent-c roles by exact path, NOT a
  # database/creds/* wildcard — factory-api also has its own,
  # unrelated database/creds/factory-backend-role credential for its own
  # evidence-table bookkeeping (terraform/vault-database/database.tf),
  # which is not an action taken "on agent-c's behalf" and must not be
  # gated by this EGP.
  #
  # prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 2:
  # `has_task` closes a real, narrow gap — the previous version only
  # checked the metadata *role* tag, not whether the child token was
  # actually minted for a specific task. Be honest about what this does
  # and does not prove: Sentinel evaluates only what's in the request/
  # token at policy-check time, with no way to consult the application's
  # own database, so it cannot verify this is the CORRECT current task —
  # only that backend/src/vault.js's mintAgentTaggedChildToken minted
  # this specific token WITH some task bound to it, making a task-less
  # (or accidentally-reused, task-blank) credential request structurally
  # impossible rather than merely discouraged by application discipline.
  # Confirming the task ID is the RIGHT one is what
  # scripts/vault-audit-crosscheck.py's independent cross-check against
  # credential_events.task_id is for — that's the layer that can
  # actually consult the database this policy deliberately cannot.
  #
  # Verified live before writing this: `token.metadata["factory_task"]
  # else "" is not ""` correctly denies a real child token minted
  # without factory_task set, and allows the identical request once
  # factory_task carries any non-empty value — tested against this
  # cluster using factory-api's own real Vault Agent-rendered token as
  # the parent, not a synthetic case.
  paths             = ["database/creds/factory-bad-role", "database/creds/factory-good-role"]
  enforcement_level = "hard-mandatory"
  policy            = <<-EOT
    metadata_ok = rule {
        token.metadata["factory_agent"] is "agent-c"
    }

    has_task = rule {
        token.metadata["factory_task"] else "" is not ""
    }

    main = rule {
        metadata_ok and has_task
    }
  EOT
}

# The audit trail may not be disabled. Reused near-verbatim from
# arcanium/terraform/vault-sentinel/main.tf, whose comment claimed "no
# Factory-specific adaptation needed" — that claim was wrong. Both real
# audit devices (scripts/vault-bootstrap.sh's `vault audit enable
# -path=primary file ...`, run against vault-s and against the vault-1/2/3
# cluster) are enabled with no `-namespace` flag, i.e. in the root
# namespace, not `factory`. An earlier version of this resource set
# `namespace = "factory"` to match the sibling EGP above, which guards a
# path that genuinely lives in `factory` — copied without checking that
# `sys/audit/*` does not. That left the actual audit devices with zero
# Sentinel protection: a root-token holder could `vault audit disable
# primary` with no resistance. No `namespace` argument here means this
# resource evaluates in the provider's own default namespace (root — see
# `provider "vault"` above, which sets none), matching where the paths it
# guards actually are.
resource "vault_egp_policy" "protect_audit_devices" {
  name              = "protect-audit-devices"
  paths             = ["sys/audit/*"]
  enforcement_level = "hard-mandatory"
  policy            = <<-EOT
    main = rule {
        not request.operation is "delete"
    }
  EOT
}
