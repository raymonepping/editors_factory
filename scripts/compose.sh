#!/bin/sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <vault|infra|ollama|api|agents|ui> <compose arguments...>" >&2
  exit 64
fi

stack=$1
shift

case "$stack" in
vault | infra | ollama | api | agents | ui) ;;
*)
  echo "Unknown stack: $stack" >&2
  exit 64
  ;;
esac

project_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$project_root/compose/$stack/compose.yaml"

if [ ! -f "$compose_file" ]; then
  echo "Stack '$stack' is not implemented yet: $compose_file is missing." >&2
  exit 66
fi

if ! command -v podman >/dev/null 2>&1; then
  echo "Podman is required but was not found in PATH." >&2
  exit 69
fi

# Pin the native provider when it is installed. Callers can override this for
# compatibility testing without changing the canonical project workflow.
: "${PODMAN_COMPOSE_PROVIDER:=podman-compose}"
export PODMAN_COMPOSE_PROVIDER

run_compose() {
  podman compose \
    --project-name "factory-$stack" \
    --file "$compose_file" \
    --env-file "$project_root/.env" \
    "$@"
}

# Inherited from arcanium/vault_reference's scripts/compose.sh (this
# project's `container_name:`/project-name convention is adapted from the
# same source — see prompts/base_project/01_01_factory_stack.md). Found
# live there, Prompt 29 Deliverable 7: a plain `up -d` against a stack
# with inter-container dependencies (arcanium's identity stack) left one
# container not running at all (not even a stopped container) after
# `podman-compose` printed errors about a dependency having "dependent
# containers" and its name "already in use" — a real podman-compose
# dependency-ordering race, not a genuine config problem. A second,
# identical `up -d` immediately afterward started it cleanly. This is a
# podman-compose behavior, not specific to any one stack's containers, so
# the same retry applies here even though Factory's own stacks (vault,
# infra, ollama, api, agents, ui) are different from arcanium's. Retry
# once, only for `up` invocations, and only when the output actually
# matches this known race — a genuine failure (bad image, real port
# conflict, etc.) still fails after one retry, not silently forever.
first_arg="${1:-}"
if [ "$first_arg" != "up" ]; then
  exec podman compose \
    --project-name "factory-$stack" \
    --file "$compose_file" \
    --env-file "$project_root/.env" \
    "$@"
fi
unset first_arg

log=$(mktemp)
trap 'rm -f "$log"' EXIT

status=0
run_compose "$@" >"$log" 2>&1 || status=$?
cat "$log"

if [ "$status" -ne 0 ] && grep -qE 'dependent container|already in use' "$log"; then
  echo "[compose.sh] '$stack up' hit the known dependent-container race — retrying once" >&2
  status=0
  run_compose "$@" >"$log" 2>&1 || status=$?
  cat "$log"
fi

exit "$status"
