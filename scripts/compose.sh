#!/bin/sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <vault|infra|identity|ollama|api|agents|ui> <compose arguments...>" >&2
  exit 64
fi

stack=$1
shift

case "$stack" in
vault | infra | identity | ollama | api | agents | ui) ;;
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

# docker-compose, not podman-compose: podman-compose turns every
# `depends_on` into a hard Podman `--requires` link, so a finished one-shot
# container (identity-secrets-init) can never be removed while the services
# that waited on it exist ("has dependent containers which must be removed
# before it"), and `up` hits the dependent-container race handled below.
# docker-compose orders startup itself and creates no such links: once the
# stack is up, `podman rm factory-identity-secrets-init` just works. Every
# service sets container_name, so names are identical under both providers.
# Override with PODMAN_COMPOSE_PROVIDER=podman-compose if ever needed.
: "${PODMAN_COMPOSE_PROVIDER:=docker-compose}"
export PODMAN_COMPOSE_PROVIDER

run_compose() {
  podman compose \
    --project-name "factory-$stack" \
    --file "$compose_file" \
    --env-file "$project_root/.env" \
    "$@"
}

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

# Only reachable under podman-compose (see the provider note above).
if [ "$status" -ne 0 ] && grep -qE 'dependent container|already in use' "$log"; then
  echo "[compose.sh] '$stack up' hit the known dependent-container race — retrying once" >&2
  status=0
  run_compose "$@" >"$log" 2>&1 || status=$?
  cat "$log"
fi

exit "$status"
