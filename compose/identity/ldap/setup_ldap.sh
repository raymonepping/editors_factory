#!/usr/bin/env bash
# setup_ldap.sh — idempotent per-entry loader for bootstrap.ldif.
# Runs inside the ldap-bootstrap container (profiles: ["init"]).
set -euo pipefail

LDAP_HOST="${LDAP_HOST:-openldap}"
BASE_DN="${LDAP_BASE_DN:-dc=factory,dc=local}"
BIND_DN="cn=admin,${BASE_DN}"
LDIF="/bootstrap/bootstrap.ldif"

echo "Waiting for ${LDAP_HOST}..."
for _ in $(seq 1 30); do
  ldapsearch -x -H "ldap://${LDAP_HOST}" -D "$BIND_DN" -w "$LDAP_ADMIN_PASSWORD" -b "$BASE_DN" -s base >/dev/null 2>&1 && break
  sleep 2
done

added=0
skipped=0
failed=0

entry=""
apply_entry() {
  [ -z "$1" ] && return 0
  local dn
  dn="$(printf '%s\n' "$1" | awk -F': ' '/^dn:/{print $2; exit}')"
  [ -z "$dn" ] && return 0

  if ldapsearch -x -H "ldap://${LDAP_HOST}" -D "$BIND_DN" -w "$LDAP_ADMIN_PASSWORD" \
    -b "$dn" -s base >/dev/null 2>&1; then
    echo "  = exists: $dn"
    skipped=$((skipped + 1))
    return 0
  fi

  if printf '%s\n' "$1" | ldapadd -x -H "ldap://${LDAP_HOST}" -D "$BIND_DN" -w "$LDAP_ADMIN_PASSWORD" >/dev/null 2>&1; then
    echo "  + added: $dn"
    added=$((added + 1))
  else
    echo "  ! failed: $dn" >&2
    failed=$((failed + 1))
  fi
}

while IFS= read -r line; do
  if [ -z "$line" ]; then
    apply_entry "$entry"
    entry=""
  elif [[ "$line" == \#* ]]; then
    continue
  else
    entry="${entry}${line}"$'\n'
  fi
done <"$LDIF"
apply_entry "$entry"

echo
echo "LDAP fixture: ${added} added, ${skipped} already present, ${failed} failed"
[ "$failed" -eq 0 ] || exit 1

echo
echo "Demo accounts (local demo only):"
echo "  raymon / Factory-raymon-2026  (factory-operator)"
echo "  barend / Factory-barend-2026  (factory-operator)"
echo "  claire / Factory-claire-2026  (factory-viewer)"
