#!/bin/sh
# compose/vault/vault-agent/entrypoint.sh — factory-api's Vault Agent.
#
# Waits for the AppRole files (written by vault-rotator), then runs Vault
# Agent WITH A WATCHDOG instead of exec-ing it.
#
# Why (CLAUDE.md gotcha #9, found live more than once, most recently
# 2026-09-30): Vault Agent's token can die without the agent noticing —
# renewals stop, no re-authentication happens, nothing is logged, and the
# agent keeps handing out a dead token. The container healthcheck catches it
# (a real `token lookup`), but a healthcheck only reports; nothing acted on
# it, so factory-api lost Vault access until someone ran
# `make vault-agent-recover`.
#
# The watchdog asks Vault about the sink token every WATCHDOG_INTERVAL
# seconds. When Vault REJECTS it (permission denied / invalid token)
# WATCHDOG_MAX_FAILURES times in a row, it stops the agent and exits
# non-zero; `restart: unless-stopped` starts a fresh container, which logs
# in again with the current secret-id. factory-api re-reads the token file
# on every Vault call (backend/src/vault.js readAgentToken), and its DB
# credential heartbeat reissues within ~60 s — no recreate needed.
#
# Only a positive rejection counts. If Vault is unreachable (sealed,
# restarting, network), restarting the agent cannot help, so those checks
# are not counted.
set -eu
umask 077

: "${WATCHDOG_GRACE:=60}"          # seconds after start before the first check
: "${WATCHDOG_INTERVAL:=20}"       # seconds between checks
: "${WATCHDOG_MAX_FAILURES:=3}"    # consecutive rejections before a restart
TOKEN_FILE=/vault/secrets/token

log() { echo "[vault-agent entrypoint] $*"; }

log "waiting for role-id and secret-id in /run/approle..."
attempt=0
while [ ! -s /run/approle/role-id ] || [ ! -s /run/approle/secret-id ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    log "timed out waiting for /run/approle files" >&2
    exit 1
  fi
  sleep 1
done
log "AppRole credentials found, starting vault agent (with token watchdog)..."

vault agent -config=/vault/agent/config.hcl &
AGENT=$!

# Forward container stop to the agent, and wake up promptly from sleeps.
trap 'kill -TERM "$AGENT" 2>/dev/null; wait "$AGENT" 2>/dev/null; exit 0' TERM INT
nap() { sleep "$1" & wait $! || true; }

nap "$WATCHDOG_GRACE"
fails=0
while kill -0 "$AGENT" 2>/dev/null; do
  if [ -s "$TOKEN_FILE" ]; then
    if out=$(VAULT_TOKEN=$(cat "$TOKEN_FILE") vault token lookup -format=json 2>&1); then
      fails=0
    elif printf '%s' "$out" | grep -qiE "permission denied|invalid token|bad token"; then
      fails=$((fails + 1))
      log "watchdog: Vault rejected the agent's token ($fails/$WATCHDOG_MAX_FAILURES)"
    fi
  fi
  if [ "$fails" -ge "$WATCHDOG_MAX_FAILURES" ]; then
    log "watchdog: token is dead and the agent has not re-authenticated — stopping it so the container restarts and logs in fresh"
    kill -TERM "$AGENT" 2>/dev/null || true
    wait "$AGENT" 2>/dev/null || true
    exit 1
  fi
  nap "$WATCHDOG_INTERVAL"
done

# The agent exited on its own: propagate its status so the restart policy applies.
wait "$AGENT"
exit $?
