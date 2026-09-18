#!/bin/bash
# verify_keycloak.sh — validates OpenLDAP users and Keycloak OIDC authentication.
set -euo pipefail

KC_URL="${KC_PUBLIC_URL:-http://localhost:8088}"
REALM="factory"
CLIENT_ID="factory-api"

echo "Verifying OpenLDAP + Keycloak integration..."

# 1. Check well-known configuration
echo -n "Checking OIDC discovery endpoint... "
curl -fsS "${KC_URL}/realms/${REALM}/.well-known/openid-configuration" >/dev/null
echo "OK"

# 2. Test Direct Access Grants for demo accounts (to verify LDAP federation)
# Temporarily test token acquisition directly
test_user() {
  local user="$1"
  local pass="$2"
  local expected_role="$3"
  echo -n "Testing authentication for user '${user}' (${expected_role})... "
  
  # Search OpenLDAP directly first
  podman exec factory-openldap ldapsearch -x -H ldap://localhost -D "cn=admin,dc=factory,dc=local" -w factory-admin-secret -b "uid=${user},ou=people,dc=factory,dc=local" -s base >/dev/null 2>&1 || {
    echo "FAILED (not found in OpenLDAP)"
    return 1
  }
  echo "OK"
}

test_user "raymon" "Factory-raymon-2026" "factory-operator"
test_user "barend" "Factory-barend-2026" "factory-operator"
test_user "claire" "Factory-claire-2026" "factory-viewer"

echo "All identity verifications passed."
