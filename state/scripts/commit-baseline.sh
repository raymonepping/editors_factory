#!/usr/bin/env bash
# state/scripts/commit-baseline.sh — the ONLY supported way to commit a
# baseline. Uses commit_gh exclusively; there is no plain-git fallback.
set -euo pipefail
umask 077

usage() {
  echo "Usage: $0 <baseline-id> [tag-name] [commit-message]" >&2
  exit 64
}

[ "$#" -ge 1 ] || usage
baseline_id=$1
tag_name=${2:-}
commit_message=${3:-"state: capture baseline $baseline_id"}

root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"

command -v commit_gh >/dev/null 2>&1 || {
  echo "commit_gh is required and was not found on PATH. There is no plain-git fallback for baseline commits — install/configure commit_gh before continuing." >&2
  exit 1
}

baseline_dir="state/baselines/$baseline_id"
[ -d "$baseline_dir" ] || {
  echo "Unknown baseline: $baseline_id ($baseline_dir does not exist)" >&2
  exit 1
}

echo "[commit-baseline] Running commit_gh --doctor"
commit_gh --doctor

echo "[commit-baseline] Validating baseline secret-safety"
"$root/state/scripts/validate-state.sh" "$baseline_id"

echo "[commit-baseline] Running commit_gh --scan"
commit_gh --scan

# Refuse if unrelated working-tree changes exist outside state/.
outside_changes=$(git status --porcelain | awk '{print $2}' | grep -v '^state/' || true)
if [ -n "$outside_changes" ]; then
  echo "Refusing to commit: uncommitted changes exist outside state/:" >&2
  echo "$outside_changes" >&2
  echo "Commit or stash those separately first." >&2
  exit 1
fi

source_sha=$(awk -F': *' '/^    commit:/ { gsub(/"/,"",$2); print $2; exit }' "$baseline_dir/manifest.yaml")
echo "[commit-baseline] Baseline '$baseline_id' captured source SHA: $source_sha"

git add "$baseline_dir" state/CURRENT 2>/dev/null || true

attempt_commit() {
  commit_gh --message "$commit_message" --tree false
}

if ! attempt_commit; then
  echo "[commit-baseline] First commit_gh attempt did not land (possible pre-commit hook reformat). Re-validating and retrying once." >&2
  "$root/state/scripts/validate-state.sh" "$baseline_id"
  commit_gh --scan
  attempt_commit || {
    echo "commit_gh did not commit after a retry. Failing clearly rather than guessing." >&2
    exit 1
  }
fi

artifact_sha=$(git rev-parse HEAD)

if [ -n "$tag_name" ]; then
  echo "[commit-baseline] Tagging captured source SHA $source_sha as $tag_name"
  git tag -a "$tag_name" "$source_sha" -m "$commit_message"
  echo "[commit-baseline] Tag created locally. Push explicitly if remote publication is intended — this script does not push automatically."
fi

echo
echo "Baseline id:            $baseline_id"
echo "Captured source SHA:    $source_sha"
echo "Baseline artifact SHA:  $artifact_sha"
[ -n "$tag_name" ] && echo "Tag:                    $tag_name -> $source_sha"
