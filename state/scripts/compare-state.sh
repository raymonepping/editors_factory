#!/usr/bin/env bash
# state/scripts/compare-state.sh — diff two baselines, or one baseline
# against its recorded predecessor.
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 <baseline-a> [<baseline-b>]" >&2
  echo "  If <baseline-b> is omitted, the predecessor of <baseline-a> is" >&2
  echo "  resolved from manifest.yaml (previous_baseline field, falling" >&2
  echo "  back to captured_at ordering) — never from filesystem mtime." >&2
  exit 64
}

[ "$#" -ge 1 ] || usage

root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"

command -v jq >/dev/null 2>&1 || {
  echo "jq is required." >&2
  exit 2
}

manifest_field() {
  # extremely small manifest.yaml — a handful of "key: value" lines is
  # sufficient to parse without a full YAML parser. Match the key at ANY
  # indentation level (manifest.yaml nests source.git.commit etc. two
  # levels deep) rather than assuming a fixed 0- or 2-space indent — found
  # live: a fixed-indent match silently returned empty for every
  # baseline.git.* field (commit/branch/tag/dirty are 4-space indented
  # under "git:", which is itself 2-space indented under "baseline:"),
  # which then rendered as a false "unchanged (UNKNOWN)" for every field
  # instead of the real values.
  local file=$1 key=$2
  awk -v k="$key" '
    $0 ~ "^[ ]*"k":" { v=$0; sub("^[ ]*"k": *", "", v); gsub(/^"|"$/, "", v); print v; exit }
  ' "$file"
}

resolve_predecessor() {
  local of=$1
  local mf="state/baselines/$of/manifest.yaml"
  [ -f "$mf" ] || {
    echo "No manifest.yaml for baseline '$of'." >&2
    exit 1
  }
  local prev
  prev=$(manifest_field "$mf" previous_baseline)
  if [ -n "$prev" ] && [ -d "state/baselines/$prev" ]; then
    echo "$prev"
    return 0
  fi
  # Fall back to captured_at ordering across all baselines.
  local target_time best_id="" best_time=""
  target_time=$(manifest_field "$mf" captured_at)
  for d in state/baselines/*/; do
    id=$(basename "$d")
    [ "$id" = "$of" ] && continue
    [ -f "state/baselines/$id/manifest.yaml" ] || continue
    t=$(manifest_field "state/baselines/$id/manifest.yaml" captured_at)
    [ -n "$t" ] || continue
    if [ "$t" \< "$target_time" ]; then
      if [ -z "$best_time" ] || [ "$t" \> "$best_time" ]; then
        best_time=$t
        best_id=$id
      fi
    fi
  done
  if [ -z "$best_id" ]; then
    echo "No previous baseline could be determined for '$of' (no previous_baseline field and no earlier captured_at found)." >&2
    exit 1
  fi
  echo "$best_id"
}

a=$1
if [ "$#" -ge 2 ]; then
  b=$2
else
  b=$a
  a=$(resolve_predecessor "$b")
  echo "Resolved predecessor of '$b': '$a'" >&2
fi

for id in "$a" "$b"; do
  [ -d "state/baselines/$id" ] || {
    echo "Unknown baseline: $id" >&2
    exit 1
  }
done

mf_a="state/baselines/$a/manifest.yaml"
mf_b="state/baselines/$b/manifest.yaml"

echo "Comparing baseline '$a' -> '$b'"
echo

compare_field() {
  local label=$1 key=$2
  local va vb
  va=$(manifest_field "$mf_a" "$key")
  vb=$(manifest_field "$mf_b" "$key")
  [ -n "$va" ] || va="UNKNOWN"
  [ -n "$vb" ] || vb="UNKNOWN"
  if [ "$va" = "$vb" ]; then
    printf '  %-28s unchanged (%s)\n' "$label" "$va"
  else
    printf '  %-28s %s  ->  %s\n' "$label" "$va" "$vb"
  fi
}

echo "Source"
compare_field "commit" commit
compare_field "branch" branch
compare_field "tag" tag
compare_field "dirty" dirty
echo

echo "Runtime"
compare_field "reachable" reachable
echo

echo "Components"
for name in vault infra ollama api agents ui; do
  sa="state/baselines/$a/components/$name.status.json"
  sb="state/baselines/$b/components/$name.status.json"
  classify() {
    local f=$1
    [ -f "$f" ] || {
      echo ABSENT
      return
    }
    jq -r '
      if .capture_status == "FAILED" then "FAILED"
      elif .observed_running == true then "CAPTURED_VALUE"
      elif .compose_file_present == true then "CAPTURED_VALUE"
      else "CAPTURED_EMPTY"
      end' "$f" 2>/dev/null || echo UNKNOWN
  }
  ca=$(classify "$sa")
  cb=$(classify "$sb")
  if [ "$ca" = "$cb" ]; then
    printf '  %-12s unchanged (%s)\n' "$name" "$ca"
  elif [ "$ca" = ABSENT ] || [ "$ca" = UNKNOWN ]; then
    printf '  %-12s previously unobserved; now %s\n' "$name" "$cb"
  else
    printf '  %-12s %s  ->  %s\n' "$name" "$ca" "$cb"
  fi
done
echo

echo "Verification"
va_file="state/baselines/$a/verification/results.json"
vb_file="state/baselines/$b/verification/results.json"
if [ -f "$va_file" ] && [ -f "$vb_file" ]; then
  jq -r '.[].check' "$vb_file" 2>/dev/null | sort -u | while IFS= read -r check; do
    ra=$(jq -r --arg c "$check" '.[] | select(.check==$c) | .result' "$va_file" 2>/dev/null | head -1)
    rb=$(jq -r --arg c "$check" '.[] | select(.check==$c) | .result' "$vb_file" 2>/dev/null | head -1)
    [ -n "$ra" ] || ra=ABSENT
    [ -n "$rb" ] || rb=ABSENT
    if [ "$ra" = "$rb" ]; then
      printf '  %-20s unchanged (%s)\n' "$check" "$ra"
    else
      printf '  %-20s %s  ->  %s\n' "$check" "$ra" "$rb"
    fi
  done
fi

echo
echo "Full detail: state/baselines/$a/ vs state/baselines/$b/"
