# Vault namespace — factory (Enterprise).
#
# Not multi-tenant isolation (Factory has no second tenant yet, unlike
# arcanium's own supplier-namespace use case) — a deliberate boundary
# around Factory's ENTIRE Vault footprint (auth method, policies,
# database secrets engine), so it never silently ends up sharing root
# namespace configuration with whatever else lands on this Vault
# cluster over time. See security/authority-model.md's Namespace
# subsection for the full reasoning.

resource "vault_namespace" "factory" {
  path = "factory"
}
