#!/usr/bin/env bash
# state/scripts/capture-state.sh — atomic, evidence-based project baseline.
# See prompts/process/00_01_state_recording_baseline.md and state/README.md.
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 <baseline-id> [\"purpose\"] [--with-scenarios]" >&2
  exit 64
}

[ "$#" -ge 1 ] || usage
baseline_id=$1
shift

purpose="(no purpose provided)"
with_scenarios=false
for arg in "$@"; do
  case "$arg" in
  --with-scenarios) with_scenarios=true ;;
  *) purpose=$arg ;;
  esac
done

case "$baseline_id" in
'' | *[!A-Za-z0-9_.-]*)
  echo "Invalid baseline id: '$baseline_id' (use letters, digits, '_', '-', '.')" >&2
  exit 64
  ;;
esac

root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"

for tool in git jq folder_tree; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Missing required command: $tool" >&2
    exit 69
  }
done

final_dir="state/baselines/$baseline_id"
tmp_dir="state/.capture-$baseline_id.tmp"

if [ -e "$final_dir" ]; then
  echo "Baseline '$baseline_id' already exists at $final_dir — refusing to overwrite." >&2
  exit 1
fi
if [ -e "$tmp_dir" ]; then
  echo "A previous capture left '$tmp_dir' in place. Inspect and remove it before retrying." >&2
  exit 1
fi

mkdir -p "$tmp_dir"/source "$tmp_dir"/runtime "$tmp_dir"/components "$tmp_dir"/verification

capture_ok=true
abort() {
  echo "Capture aborted: $tmp_dir left in place for inspection." >&2
  exit 1
}

captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

previous_baseline=""
[ -s state/CURRENT ] && previous_baseline=$(cat state/CURRENT)

# ---------------------------------------------------------------------------
# Source state
# ---------------------------------------------------------------------------

commit=$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)
branch=$(git branch --show-current 2>/dev/null || echo UNKNOWN)
tag=$(git describe --tags --exact-match 2>/dev/null || echo "")
git status --short >"$tmp_dir/source/git-status.txt" 2>&1 || true
dirty=false
[ -s "$tmp_dir/source/git-status.txt" ] && dirty=true
git diff >"$tmp_dir/source/diff.patch" 2>&1 || true

{
  echo "commit=$commit"
  echo "branch=$branch"
  echo "tag=$tag"
  echo "dirty=$dirty"
} >"$tmp_dir/source/git.txt"

# Whitelisted tool/runtime versions only — never a full environment dump.
{
  echo "{"
  first=true
  add_version() {
    local name=$1 cmd=$2
    local v
    v=$(eval "$cmd" 2>&1 | grep -i 'version' | head -1 || true)
    [ -n "$v" ] || v=$(eval "$cmd" 2>/dev/null | head -1 || true)
    [ -n "$v" ] || v="not installed"
    [ "$first" = true ] || echo ","
    first=false
    printf '  "%s": %s' "$name" "$(jq -Rn --arg v "$v" '$v')"
  }
  add_version git "git --version"
  add_version podman "podman --version"
  add_version vault "vault --version"
  add_version node "node --version"
  add_version npm "npm --version"
  add_version ollama "ollama --version"
  add_version jq "jq --version"
  echo ""
  echo "}"
} | jq . >"$tmp_dir/source/versions.json" || echo '{}' >"$tmp_dir/source/versions.json"

# Whitelisted, non-secret source/config files only. Extend this list as the
# project gains real application code (backend/, agents/, ui/, compose/).
whitelist_files() {
  {
    [ -f .env.example ] && echo .env.example
    [ -f .gitleaks.toml ] && echo .gitleaks.toml
    [ -f .editorconfig ] && echo .editorconfig
    [ -f .dockerignore ] && echo .dockerignore
    [ -f .gitignore ] && echo .gitignore
    [ -f README.md ] && echo README.md
    find prompts security scripts -type f 2>/dev/null
  } | sort -u
}
: >"$tmp_dir/source/hashes.sha256"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue
  shasum -a 256 "$f" >>"$tmp_dir/source/hashes.sha256"
done < <(whitelist_files)

folder_tree --output git . >"$tmp_dir/source/project-tree.md" 2>&1 || {
  echo "folder_tree failed — this is required, not optional." >&2
  abort
}

# ---------------------------------------------------------------------------
# Runtime state (Podman) — whitelisted fields only, never a raw inspect dump
# ---------------------------------------------------------------------------

runtime_type="podman"
if command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
  podman ps -a --filter "name=factory-" --filter "name=agent-" --filter "name=vault-" \
    --format '{{json .}}' 2>/dev/null | jq -s '[.[] | {Names, Image, State, Status, Ports}]' \
    >"$tmp_dir/runtime/containers.json" || echo '[]' >"$tmp_dir/runtime/containers.json"
  podman network ls --filter "name=factory-" --format '{{json .}}' 2>/dev/null | jq -s '.' \
    >"$tmp_dir/runtime/networks.json" || echo '[]' >"$tmp_dir/runtime/networks.json"
  podman volume ls --filter "name=factory" --format '{{.Name}}' 2>/dev/null \
    >"$tmp_dir/runtime/volumes.txt" || : >"$tmp_dir/runtime/volumes.txt"
  runtime_reachable=true
else
  echo '[]' >"$tmp_dir/runtime/containers.json"
  echo '[]' >"$tmp_dir/runtime/networks.json"
  : >"$tmp_dir/runtime/volumes.txt"
  runtime_reachable=false
fi

# ---------------------------------------------------------------------------
# Component adapters
#
# Discovered from repository evidence (prompts/base_project, prompts/backend,
# prompts/api, prompts/agents, prompts/frontend), not assumed. Each entry:
#   name | compose dir | container name-filter substring
# A component whose compose dir does not exist yet is a valid, honest
# CAPTURED "not yet built" result — not a failure. This is a brand-new
# project being assembled incrementally from prompts/; early baselines are
# expected to show most components absent.
# ---------------------------------------------------------------------------

components="vault:compose/vault:factory-vault_ infra:compose/infra:factory-postgres ollama:compose/ollama:factory-ollama api:compose/api:factory-api agents:compose/agents:agent- ui:compose/ui:factory-ui"

component_status_overall=CAPTURED
for entry in $components; do
  name=${entry%%:*}
  rest=${entry#*:}
  compose_dir=${rest%%:*}
  filter=${rest#*:}

  compose_exists=false
  [ -f "$compose_dir/compose.yaml" ] && compose_exists=true

  running_count=0
  if [ "$runtime_reachable" = true ] && [ "$compose_exists" = true ]; then
    running_count=$(podman ps --filter "name=${filter}" --format '{{.Names}}' 2>/dev/null | wc -l | tr -d ' ')
  fi

  status=CAPTURED
  jq -n \
    --arg name "$name" \
    --arg expected "$compose_exists" \
    --arg observed "$([ "$running_count" -gt 0 ] && echo true || echo false)" \
    --arg running_count "$running_count" \
    --arg capture_status "$status" \
    '{component: $name, expected: ($expected == "true"), compose_file_present: ($expected == "true"), running_containers: ($running_count|tonumber), observed_running: ($observed == "true"), capture_status: $capture_status}' \
    >"$tmp_dir/components/$name.status.json" 2>/dev/null || {
    status=FAILED
    component_status_overall=PARTIAL
  }
done

# ---------------------------------------------------------------------------
# Observed functional verification — read-only only, mutating is opt-in
# ---------------------------------------------------------------------------

verification_results="$tmp_dir/verification/results.json"
echo '[]' >"$verification_results"

record_check() {
  local name=$1 result=$2 detail=$3
  jq --arg n "$name" --arg r "$result" --arg d "$detail" \
    '. += [{check: $n, result: $r, detail: $d}]' \
    "$verification_results" >"$verification_results.tmp" && mv "$verification_results.tmp" "$verification_results"
}

# Read-only checks — only meaningful once a component actually exists.
if [ "$runtime_reachable" = true ]; then
  if podman ps --filter "name=factory-api" --format '{{.Names}}' 2>/dev/null | grep -q factory-api; then
    if curl -fsS -m 3 "http://localhost:${API_PORT:-3001}/api/health" >/dev/null 2>&1; then
      record_check "backend-health" "PASS" "GET /api/health responded"
    else
      record_check "backend-health" "FAILED" "factory-api container running but /api/health did not respond"
    fi
  else
    record_check "backend-health" "UNKNOWN" "not run — factory-api is not running"
  fi

  if podman ps --filter "name=factory-ollama" --format '{{.Names}}' 2>/dev/null | grep -q factory-ollama; then
    configured_ollama_model=$(sed -n 's/^OLLAMA_MODEL=//p' .env 2>/dev/null | tail -n 1 | tr -d '\r')
    if [ -n "$configured_ollama_model" ] &&
      curl -fsS -m 5 "http://127.0.0.1:11434/api/tags" 2>/dev/null |
      jq -e --arg model "$configured_ollama_model" \
        'any(.models[]?; .name == $model or .model == $model)' >/dev/null; then
      record_check "ollama-model" "PASS" "GET /api/tags responded and $configured_ollama_model is present"
    else
      record_check "ollama-model" "FAILED" "factory-ollama is running but its configured model was not verified through GET /api/tags"
    fi
  else
    record_check "ollama-model" "UNKNOWN" "not run — factory-ollama is not running"
  fi
else
  record_check "backend-health" "UNKNOWN" "not run — Podman not reachable"
  record_check "ollama-model" "UNKNOWN" "not run — Podman not reachable"
fi

if [ "$with_scenarios" = true ]; then
  record_check "mutating-scenarios" "UNKNOWN" "not implemented yet — no mutating scenario suite exists for this project yet"
else
  record_check "mutating-scenarios" "UNKNOWN" "not run — mutating scenario requires --with-scenarios"
fi

# ---------------------------------------------------------------------------
# Manifest + summary
# ---------------------------------------------------------------------------

overall=CAPTURED
if [ "$component_status_overall" != "CAPTURED" ]; then overall=$component_status_overall; fi
if grep -q '"result": "FAILED"' "$verification_results" 2>/dev/null; then overall=FAILED; fi

{
  echo "baseline:"
  echo "  id: \"$baseline_id\""
  echo "  purpose: \"$purpose\""
  echo "  captured_at: \"$captured_at\""
  echo "  project: \"editors_factory\""
  echo "  previous_baseline: \"$previous_baseline\""
  echo "  git:"
  echo "    commit: \"$commit\""
  echo "    branch: \"$branch\""
  echo "    tag: \"$tag\""
  echo "    dirty: $dirty"
  echo
  echo "runtime:"
  echo "  type: \"$runtime_type\""
  echo "  architecture: \"podman-compose, multi-stack (see prompts/base_project/01_01_factory_stack.md)\""
  echo "  reachable: $runtime_reachable"
  echo
  echo "components:"
  for entry in $components; do
    name=${entry%%:*}
    st=$(jq -r '.capture_status' "$tmp_dir/components/$name.status.json" 2>/dev/null || echo UNKNOWN)
    expected=$(jq -r '.expected' "$tmp_dir/components/$name.status.json" 2>/dev/null || echo false)
    running=$(jq -r '.observed_running' "$tmp_dir/components/$name.status.json" 2>/dev/null || echo false)
    echo "  $name:"
    echo "    capture_status: $st"
    echo "    compose_file_present: $expected"
    echo "    observed_running: $running"
  done
  echo
  echo "verification:"
  jq -r '.[] | "  \(.check): \(.result)"' "$verification_results" 2>/dev/null
  echo
  echo "capture:"
  echo "  overall: $overall"
  echo "  checks:"
  echo "    source: CAPTURED"
  echo "    runtime: $([ "$runtime_reachable" = true ] && echo CAPTURED || echo PARTIAL)"
  echo "    components: $component_status_overall"
  echo "    verification: CAPTURED"
} >"$tmp_dir/manifest.yaml"

{
  echo "# Baseline: $baseline_id"
  echo
  echo "## Generic summary (from manifest.yaml)"
  echo
  echo "- Purpose: $purpose"
  echo "- Captured at: $captured_at (UTC)"
  echo "- Source commit: \`$commit\` on branch \`$branch\`$([ -n "$tag" ] && echo " (tag: $tag)")"
  echo "- Working tree dirty: $dirty"
  echo "- Previous baseline: ${previous_baseline:-none}"
  echo "- Overall capture status: **$overall**"
  echo
  echo "### Components"
  echo
  echo "| Component | Compose file present | Observed running | Capture status |"
  echo "|---|---|---|---|"
  for entry in $components; do
    name=${entry%%:*}
    expected=$(jq -r '.compose_file_present' "$tmp_dir/components/$name.status.json" 2>/dev/null || echo false)
    running=$(jq -r '.observed_running' "$tmp_dir/components/$name.status.json" 2>/dev/null || echo false)
    st=$(jq -r '.capture_status' "$tmp_dir/components/$name.status.json" 2>/dev/null || echo UNKNOWN)
    echo "| $name | $expected | $running | $st |"
  done
  echo
  echo "### Verification"
  echo
  jq -r '.[] | "- **\(.check)**: \(.result) — \(.detail)"' "$verification_results" 2>/dev/null
  echo
  echo "See \`manifest.yaml\`, \`source/\`, \`runtime/\`, \`components/\`, \`verification/\` for full evidence."
  echo
  echo "## Project context"
  echo
  if [ "$dirty" = true ]; then
    echo "This baseline was captured from a dirty working tree. See \`source/git-status.txt\` and \`source/diff.patch\` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture."
  else
    echo "This baseline was captured from a clean working tree."
  fi
} >"$tmp_dir/summary.md"

# ---------------------------------------------------------------------------
# Validate, then atomically finalize
# ---------------------------------------------------------------------------

"$root/state/scripts/validate-state.sh" "$tmp_dir" || {
  echo "validate-state.sh failed against the temporary capture — aborting finalize." >&2
  abort
}

mv "$tmp_dir" "$final_dir"
echo "$baseline_id" >"$root/state/CURRENT"

echo "Baseline captured: $final_dir"
echo "Overall status: $overall"
