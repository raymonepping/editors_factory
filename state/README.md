# state/

Reproducible, evidence-based snapshots of this project's source,
deployment, and observed-functional condition. Built and governed by
`prompts/process/00_01_state_recording_baseline.md`.

## The three kinds of state a baseline records

1. **Source state** — exactly which code/configuration formed this
   baseline (Git commit, branch, tag, dirty status, diff, tool versions,
   whitelisted file hashes, and the Git-tracked project tree from
   `folder_tree`).
2. **Deployment state** — what was actually running/reachable at capture
   time (Podman containers, networks, images — only for components that
   actually exist yet; this project is built incrementally from
   `prompts/`, so early baselines will honestly show most components as
   not yet built, not as failures).
3. **Observed functional state** — what was actually verified to work via
   read-only checks (health endpoints, reachability). Mutating checks are
   opt-in only (`--with-scenarios`) and never run silently.

## `state/` is not a backup

```text
state/
= evidence of source/configuration, observed deployment condition,
  and functional verification
= safe-to-commit metadata only
= NOT sufficient to restore the system

backup/
= actual recovery material (does not exist in this project yet —
  create it separately if/when PostgreSQL dumps or Vault Raft
  snapshots need to be preserved; see scripts/vault-backup.sh and
  scripts/vault-restore-drill.sh for the Vault side of that, once the
  Vault stack from prompts/base_project/02_01_vault_ha_cluster.md exists)
= sensitive
= not casually committed
```

A baseline may record backup *metadata* (e.g. whether a PostgreSQL dump
exists and its hash) but never copies the backup itself into `state/`.

## Status semantics

```text
CAPTURED   the intended observation completed and produced trustworthy
           data — including an honest "this component does not exist
           yet" result, which is a valid CAPTURED fact for a project
           still being built from prompts/
PARTIAL    some useful state was captured, but part of the intended
           observation could not be completed
UNKNOWN    the state could not be determined — a valid first-class result
FAILED     the check ran and positively observed a failure
```

Never collapse "unreachable" into "empty," "unknown" into "healthy," or
"not run" into "pass."

## Secret safety

**Whitelist, do not redact.** `validate-state.sh` independently checks
every baseline for known local secret values and credential-shaped
content before it is ever committed. There is no `--force` bypass. See
`prompts/process/00_01_state_recording_baseline.md` Part 5 for the exact
model.

This project's known secret-bearing sources (never captured wholesale):

```text
.env
.secrets/vault/           (created by scripts/vault-prepare.sh, once run)
vault-tls/                (private key material, once generated)
vault-s/config/*.hclic    (Vault Enterprise license files)
any Vault root token / unseal key / AppRole secret-id
per-agent bearer tokens (prompts/backend/01_01_orchestrator_api.md)
```

## Folder structure

```text
state/
├── README.md            (this file)
├── CURRENT               points at the latest successfully completed baseline id
├── scripts/
│   ├── capture-state.sh
│   ├── validate-state.sh
│   ├── compare-state.sh
│   └── commit-baseline.sh
└── baselines/
    └── <baseline-id>/
        ├── manifest.yaml
        ├── summary.md
        ├── source/
        ├── runtime/
        ├── components/
        └── verification/
```

## Usage

```bash
state/scripts/capture-state.sh <baseline-id> ["purpose"] [--with-scenarios]
state/scripts/validate-state.sh <baseline-id-or-path>
state/scripts/compare-state.sh <baseline-a> [<baseline-b>]
state/scripts/commit-baseline.sh <baseline-id> [tag-name] [commit-message]
```

## Baseline naming

```text
YYYY-MM-DD_<label>
```

Examples used so far in this project:

```text
2026-09-17_initial          before any infrastructure is built
2026-09-17_post-factory-stack   after prompts/base_project/01_01 lands
```

Baselines are immutable once created — never edited or overwritten in
place. If a capture turns out wrong, create a new baseline; do not hand-
edit an existing one.

## Recommended capture cadence

```text
initial / pre-change
post-change
post-next-major-phase
```

For this project specifically, a sensible cadence tracks the numbered
prompts under `prompts/base_project/`, `prompts/backend/`,
`prompts/api/`, `prompts/agents/`, and `prompts/frontend/`: capture after
each prompt's deliverables land and its own validation section passes.
The post-state of one prompt is normally sufficient as the pre-state of
the next; do not create redundant duplicate baselines without a reason.

## Comparison semantics

`compare-state.sh` distinguishes `ABSENT`, `UNKNOWN`, `FAILED`,
`CAPTURED_EMPTY`, and `CAPTURED_VALUE` between two baselines, and never
manufactures a change from a missing observation (e.g. a component that
was `UNKNOWN` in baseline A and `CAPTURED` in baseline B is reported as
"previously unobserved; now captured," never as "component added").

## Commit/tag semantics

`commit-baseline.sh` is the only supported way to commit baseline
artifacts. It requires `commit_gh` (no plain-`git` fallback), runs
`commit_gh --doctor` and `commit_gh --scan`, and runs
`validate-state.sh` as a hard gate before staging anything. It commits
only `state/` — a dirty working tree outside `state/` blocks the commit
rather than being swept in silently.
