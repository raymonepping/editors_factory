# CLAUDE.md

Operating guide for Claude Code sessions in this repository. This complements `docs/` (which describes the product) with operational knowledge specific to working *in* this codebase — lessons learned live, during this project's own development, so they don't have to be relearned every session.

## What this project is

The Factory: a local, contained HashiCorp Vault demo showing delegated-authority risk across a 4-agent chain (friendly names Assistant/Investigator/Corrector/Discovery, internal identities `agent-a`/`agent-b`/`agent-c`/`agent-d`) under BAD (broad/unsafe) and GOOD (bounded/governed) authority profiles. Podman Compose stacks (`vault`, `infra`, `identity`, `ollama`, `api`, `agents`, `ui`), Nuxt 4 dashboard, Keycloak/OpenLDAP human auth, PostgreSQL evidence trail, a 4-node Vault Enterprise Raft HA cluster. See `docs/architecture.md`, `docs/security-model.md`, and `security/authority-model.md` for what the system actually is — this file is about how to work on it.

## Before you start

- `git status` — confirm a clean tree. This repo has had more than one concurrent session (see "Concurrent sessions" below); don't assume the tree matches what you last left it in.
- `make status` for what's running, `make vault-status` for seal/leader state.
- `state/CURRENT` and the most recent entries under `state/baselines/` show what was last verified and why.
- `prompts/improvements/*.md` (gitignored, still on disk) is the numbered history of every improvement pass on this project — read the most recent ones before assuming something hasn't been built yet.

## Hard architectural boundaries — do not relax silently

- **No agent container ever holds a Vault credential.** Only the backend (`factory-api`) talks to Vault. See `security/authority-model.md`'s "Why agents do not hold Vault credentials directly" — this was tested under real pressure to relax it during the Vault KV migration and deliberately held.
- **Agents authenticate to the backend, never to each other or to Vault.** The delegation chain is human → agent-a → agent-b → agent-c. Agent-d (Discovery) is not in that chain — it observes the backend's own SSE event stream independently and stays Vault-blind too.
- **The root Vault token is not a routine credential.** Routine Terraform applies use `.secrets/vault/vault-admin-token` (narrow, periodic — `make vault-admin-bootstrap`). Root is reserved for `vault operator init`, the very first `vault-platform` apply, and re-applying `vault-admin`'s own policy (which vault-admin cannot modify on itself — deliberate self-escalation prevention).

## Operational gotchas (learned live, not obvious from reading the code)

1. **`--force-recreate` alone does not pick up source changes** for the `api`, `agents`, or `ui` images. Rebuild first: `podman build -t <image>:local -f <Containerfile> <context>/`, then recreate the container.
2. **The self-inflicted agent-backlog pattern.** Running the test suites (`npm --prefix backend test`, `npm --prefix agents test`) creates fixture tasks that queue up in agent-a's in-memory task queue. A `make demo-bad`/`make demo-good` triggered afterward can sit silently behind 5–10 minutes of stale fixture tasks timing out first. If a run looks stalled, `podman logs factory-agent-a` and look for a pile of goals like "boundary test"/"tamper test" queued ahead of the real one. Recovery: `./scripts/compose.sh agents up -d --force-recreate` (clears the in-memory queue), then `make reset` and retrigger.
3. **Recreating `factory-api` can break agents' SSE connections**, which don't always cleanly reconnect. If agent logs show repeated "SSE stream error, reconnecting" with no real progress after an API recreate, force-recreate the agents too.
4. **`commit_gh` always runs `git add .`**, regardless of what you staged yourself beforehand — pre-staging a subset has no scoping effect. For a genuinely scoped commit, `git stash push -u -- <unrelated files>` first, commit, then `git stash pop`.
5. **The `sanity_check` pre-commit hook has a real, reproducible bug**: it sometimes exits 1 even when it reports "N file(s) left unchanged." When confirmed (retry once to be sure it's not a one-off reformat), it's acceptable to `git commit --no-verify` — but always run `gitleaks protect --staged` manually first, and say so plainly in the commit message.
6. **Podman/`conmon` flakiness after a long session is usually host-level**, not a code regression — especially after many `podman exec` calls in one session. If `podman ps` and `podman machine list` both report healthy but one specific exec intermittently fails, retry once before assuming something broke. Never restart the Podman machine or prune images/volumes without asking — that affects every project on the machine, not just this one.
7. **Vault Raft leadership moves between vault-1/2/3.** Only the current leader writes audit log entries locally, so a follower's own audit log can be nearly empty even in a healthy cluster. `scripts/vault-audit-crosscheck.py` reads and merges all three nodes for exactly this reason — don't "simplify" it to read just one.
8. **`vault-agent` used to not be part of `make vault-up` — fixed, but know the failure mode if it ever regresses.** `vault-bootstrap.sh` only ever explicitly started `vault-s`/`vault-1`/`vault-2`/`vault-3`; `vault-agent` lives in the same `compose/vault/compose.yaml` but was never in that script's own `compose up -d` calls. Found live after a `make down && make up` cycle (following a Podman machine restart) silently left it torn down while the rest of the stack came back fine. `vault-up`'s own Makefile target now runs `./scripts/compose.sh vault up -d vault-agent` as its last step (idempotent, safe even when the cluster is already healthy), so `make up`/`make vault-up` bring it up on their own — nothing to do manually anymore. If this ever regresses: nothing restarts `vault-agent` automatically on its own, so `factory-api` keeps running on its last-rendered token, then starts failing Vault KV reads at startup with "permission denied / invalid token" once that token goes stale. Recovery is the same either way: `./scripts/compose.sh vault up -d vault-agent`, then recreate `factory-api` to pick up the fresh token (and recreate the agents too — recreating `factory-api` breaks their SSE connections, gotcha #3 above).
9. **`vault-agent`'s own token renewal can silently stall without falling back to re-authentication.** Found live in a session running several hours: `vault-agent` kept reporting "healthy" and its logs showed regular `renewed auth token` entries roughly every 45–60 minutes, then stopped entirely — no further renewal, no re-auth attempt, no error logged, for 70+ minutes afterward. The token it was still handing out via `/vault/secrets/token` had genuinely died (confirmed with a direct `auth/token/lookup-self` call against it: 403 "invalid token"). Every route needing a fresh backend DB credential then failed with "password authentication failed," while `GET /api/health` kept reporting `db.ok: true` regardless — that check doesn't re-verify the credential against Vault on every call, so it can lag behind reality. Symptom to watch for: normal-looking write endpoints (profile switch, reset, anything touching evidence tables) failing 500 while `/api/health` looks fine. Recovery: `./scripts/compose.sh vault up -d --force-recreate vault-agent` forces a genuine fresh AppRole login (confirmed live: logs show `authenticating` → `authentication successful`, not just another `renewed`), then recreate `factory-api` to pick up the new token, then the agents (SSE, gotcha #3). **Caution found live the same session:** `--force-recreate` targeted at `vault-agent` specifically still ended up recreating `vault-s` and `vault-1` too on this compose file, sealing `vault-s` in the process — check `make vault-status` right after and run `make vault-unseal` if `vault-s` comes back sealed; `vault-1/2/3` should then auto-unseal via transit on their own once `vault-s` is reachable again.

## Gitignored on purpose — not an oversight

`/prompts`, `/input`, `/images`, and `/article` are all gitignored. Prompt files and working notes live there and are genuinely never committed. `.env.example` is also currently gitignored (caught by the `.env.*` pattern) and has never been tracked in this repo, despite `commit_gh`'s own stated convention suggesting it should be — this is pre-existing repo state, not something to silently "fix."

## Workflow: state capture + commit, in this order

1. Commit the actual code/doc changes first, via `commit_gh` (or a manual `git commit`, falling back to `--no-verify` per gotcha #5 if needed).
2. `state/scripts/capture-state.sh <id> "<purpose>"` — captures a baseline. It refuses, correctly, if there are uncommitted changes outside `state/`.
3. `state/scripts/commit-baseline.sh <id> "" "<message>"` — commits and pushes the baseline.

Never capture state on a dirty tree. Code first, then state, always in that order.

## Testing

- `npm --prefix backend test` and `npm --prefix agents test` are real integration tests against the live running stack (this project's own "no mocks" philosophy) — not unit tests with mocked dependencies. They need the stack up.
- Playwright for UI verification: run from `ui/`, prefix any temp script `_val_`, delete it when done. Use element-based waits rather than `networkidle` when navigating to an external origin like Keycloak (a `networkidle` timeout there is usually a false alarm).
- Live-verify Vault/Terraform/Sentinel behavior before writing it into a prompt, doc, or comment — this project's own established discipline is "mint a real scoped token and test it directly against the running cluster," never assume from documentation alone. Several real, non-obvious bugs were only ever found this way (Sentinel's actual capability requirements, Control Group approval/unwrap timing, an AppRole double-namespace conflict, third-party image `_FILE`-env-var support).

## Common commands

```sh
make status                              # what's running
make vault-status                        # seal/leader state
make reset                               # baseline reset (now runs the audit cross-check automatically first)
make demo-bad / make demo-good           # trigger a live run
./scripts/vault-audit-crosscheck.py <run_id | --latest>
```

## Concurrent sessions

This repository has had more than one active Claude session working on it at once. Commits have appeared mid-session, authored as the same git identity, with a generic message ("Updated configuration and fixed bugs") — not something this session wrote. Before assuming a file's on-disk state matches what you last wrote, check `git log` for commits you don't recognize. If you find one, diff it against what you expected rather than assuming corruption or loss — every instance seen so far turned out to be legitimate in-progress work from another session, swept up by its own commit tooling (see gotcha #4 — the same `git add .` behavior), not something destroyed.
