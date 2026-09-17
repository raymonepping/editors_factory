# compose/vault — Vault Enterprise HA cluster

Four nodes, adapted from `vault_reference`/`arcanium`'s own proven
topology:

- **vault-s** — a dedicated node whose only job is running the Transit
  secrets engine that auto-unseals the real cluster, plus the primary
  audit device. It is never used for application data.
- **vault-1 / vault-2 / vault-3** — the real, three-node Raft cluster
  that Factory's backend actually talks to. Each node auto-unseals via
  `vault-s`'s `transit/keys/autounseal` key using a token
  `scripts/vault-bootstrap.sh` generates and stores locally (never
  committed).

This split exists so unsealing is automatic on every restart (no human
has to type a Shamir key back in) while keeping the auto-unseal mechanism
itself on a separate node from the data it protects.

## Startup

```bash
scripts/compose.sh vault up -d
scripts/vault-prepare.sh          # generates local TLS + verifies licenses are present
scripts/vault-bootstrap.sh        # initializes vault-s, then the vault-1/2/3 cluster
```

Or, once `Makefile` targets exist (this prompt adds them):

```bash
make vault-up
```

## Prerequisites

Two Vault Enterprise license files must already exist locally before
`vault-prepare.sh` will run — ask the project owner for them, they are
never generated or committed:

```text
vault-s/config/vault_v2.hclic
vault-s/config/vault_v2_ent.hclic
```

## Ports

```text
vault-s    https://127.0.0.1:18190
vault-1    https://127.0.0.1:18200
vault-2    https://127.0.0.1:18201
vault-3    https://127.0.0.1:18202
```

These match `scripts/vault-common.sh`'s `vault_node()` port map exactly —
every `scripts/vault-*.sh` helper works against this compose file
unmodified.

## Recovery after a host restart — or after any `vault-s` container recreate

If the nodes report sealed after a Podman machine restart:

```bash
make vault-unseal
```

Found live (prompts/base_project/02_02_vault_follow_up.md): `vault-s`
uses a manual Shamir seal, deliberately — it is the node that provides
auto-unseal for vault-1/2/3, so it cannot auto-unseal itself. Anything
that force-recreates its container (including
`scripts/compose.sh`'s own "dependent container" retry, see
`compose.sh`'s own comment) brings `vault-s` back up **sealed**, which
then cascades: vault-1/2/3 fail their own transit-seal calls against a
sealed `vault-s` and restart-loop until `vault-s` is unsealed again.
`vault-1`'s Raft leadership can shift during this window — that alone is
normal and not a problem. Run `make vault-unseal` (or
`scripts/vault-unseal.sh` directly) any time `scripts/vault-status.sh`
shows `vault-s: ... sealed=true`, or any time `vault-1`/`vault-2`/
`vault-3` are restart-looping with "Vault is sealed" in their logs.

## Non-goals

This compose file brings up Vault only. It does not configure the
PostgreSQL Database secrets engine
(`prompts/base_project/03_01_postgres_dynamic_creds.md`) or any
application-facing auth method
(`prompts/backend/01_01_orchestrator_api.md`).
