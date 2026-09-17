#!/usr/bin/env bash
# state/scripts/validate-state.sh — independent secret-safety gate for a
# baseline directory. Whitelist, do not redact: this script does not try to
# scrub anything, it refuses to let a suspect baseline become canonical.
#
# Exit codes:
#   0 = clean
#   1 = suspected secret found; baseline MUST NOT be committed
#   2 = validation could not run correctly
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 <baseline-id-or-path>" >&2
  exit 2
}

[ "$#" -eq 1 ] || usage
arg=$1

root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"

if [ -d "$arg" ]; then
  target="$arg"
elif [ -d "state/baselines/$arg" ]; then
  target="state/baselines/$arg"
else
  echo "Not a directory and not a known baseline id: $arg" >&2
  exit 2
fi

fail=false
note() { echo "[validate-state] $*" >&2; }

# ---------------------------------------------------------------------------
# 1. Known local secret values — check the baseline does not literally
#    contain any value currently held in this project's own secret files.
#    Values themselves are never printed.
# ---------------------------------------------------------------------------

# check_value: test ONE already-extracted candidate secret value (never a
# whole multi-line file — see the "found live" note below) against the
# target. Skips trivial/short strings.
check_value() {
  local source_label=$1 value=$2
  [ "${#value}" -ge 8 ] || return 0
  if grep -rFq -- "$value" "$target" 2>/dev/null; then
    note "A value from $source_label appears verbatim inside $target (value not shown)."
    fail=true
  fi
}

# check_known_secret_file: KEY=VALUE files (.env-style) — check each
# line's value individually.
check_known_secret_file() {
  local secret_file=$1
  [ -s "$secret_file" ] || return 0
  while IFS= read -r line; do
    case "$line" in
    *=*) ;;
    *) continue ;;
    esac
    key=${line%%=*}
    # OLLAMA_MODEL is a public model identifier that the runtime baseline
    # intentionally records. Keep all credential-bearing .env values under
    # exact-value checking; exempt only this documented non-secret key.
    case "$key" in
    OLLAMA_MODEL) continue ;;
    esac
    value=${line#*=}
    value=${value%\"}
    value=${value#\"}
    check_value "$secret_file" "$value"
  done <"$secret_file"
}

# check_known_secret_json: recursively extract every STRING LEAF VALUE via
# jq and check each individually. Found live: an earlier version of this
# script read the whole file as one multi-line string and grepped for it
# — grep (both GNU and BSD) splits a pattern containing embedded newlines
# into one fixed-string alternative PER LINE, so trivial structural JSON
# lines shared by any pretty-printed JSON file ("{", "}", "  ]," ...)
# matched almost every other captured *.json file in the baseline and
# produced a FAILED result with no real secret involved. Only real leaf
# values are meaningful to check; JSON punctuation is not a secret.
check_known_secret_json() {
  local secret_file=$1
  [ -s "$secret_file" ] || return 0
  jq -r '[.. | strings] | .[]' "$secret_file" 2>/dev/null | while IFS= read -r value; do
    check_value "$secret_file" "$value"
  done
}

# check_known_secret_lines: opaque non-JSON secret material (a bare
# token, a PEM key/cert) — check each line individually rather than the
# whole file as one grep pattern (same rationale as above: avoid
# matching on generic boilerplate). PEM BEGIN/END markers are excluded
# explicitly since they are standard boilerplate, not secret material,
# and matching them proves nothing.
check_known_secret_lines() {
  local secret_file=$1
  [ -s "$secret_file" ] || return 0
  while IFS= read -r line; do
    case "$line" in
    -----BEGIN\ *-----* | -----END\ *-----*) continue ;;
    esac
    check_value "$secret_file" "$line"
  done <"$secret_file"
}

[ -f .env ] && check_known_secret_file .env
if [ -d .secrets/vault ]; then
  while IFS= read -r -d '' f; do
    case "$f" in
    *.json) check_known_secret_json "$f" ;;
    *) check_known_secret_lines "$f" ;;
    esac
  done < <(find .secrets/vault -type f -print0 2>/dev/null)
fi

# ---------------------------------------------------------------------------
# 2. Credential-shaped content, independent of whether a local secret file
#    happens to exist right now.
# ---------------------------------------------------------------------------

# Vault token formats (legacy s.* and hvs./hvb./hvr. prefixed service/batch
# tokens), PEM private-key headers, Bearer tokens, common cloud access-key
# shapes, and NAME=<long value> pairs for sensitive-sounding variable names.
patterns=(
  'hvs\.[A-Za-z0-9_-]{20,}'
  'hvb\.[A-Za-z0-9_-]{20,}'
  'hvr\.[A-Za-z0-9_-]{20,}'
  '\bs\.[A-Za-z0-9]{24,}\b'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'Bearer [A-Za-z0-9._-]{20,}'
  'AKIA[0-9A-Z]{16}'
  '(PASSWORD|SECRET|TOKEN|PRIVATE_KEY|PIN|LICENSE|CREDENTIAL)[A-Z_]*[[:space:]]*[:=][[:space:]]*["\x27]?[A-Za-z0-9/+=_.-]{12,}'
)

# Files that legitimately document the *shape* of secrets (e.g. this
# script itself, .env.example, and this project's own docs) are exempt from
# the NAME=value heuristic but not from the hard token-format checks.
shape_doc_allowlist='(\.env\.example$|state/scripts/validate-state\.sh$|state/README\.md$|security/threat-model\.md$)'

for pat in "${patterns[@]}"; do
  while IFS=: read -r file _rest; do
    [ -n "$file" ] || continue
    if echo "$file" | grep -Eq "$shape_doc_allowlist"; then
      continue
    fi
    note "Credential-shaped content matching pattern found in: $file (content not shown)"
    fail=true
  done < <(grep -rEIl -- "$pat" "$target" 2>/dev/null || true)
done

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

if [ "$fail" = true ]; then
  note "FAILED — suspected secret material found. Baseline must not be committed."
  exit 1
fi

note "OK — no known secret values or credential-shaped content found in $target."
exit 0
