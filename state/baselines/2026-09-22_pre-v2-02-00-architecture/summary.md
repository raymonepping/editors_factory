# Baseline: 2026-09-22_pre-v2-02-00-architecture

## Generic summary (from manifest.yaml)

- Purpose: Before implementing 02_00: v2 dual-engine orchestration contract scaffold (backend/src/orchestrator/)
- Captured at: 2026-09-22T12:46:42Z (UTC)
- Source commit: `97d5ed5ea5240cbed7d341cc7b69f60a9b001c41` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_pre-v2-00-architecture-b
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | true | false | CAPTURED |
| infra | true | false | CAPTURED |
| ollama | true | false | CAPTURED |
| api | true | false | CAPTURED |
| agents | true | false | CAPTURED |
| ui | true | false | CAPTURED |

### Verification

- **backend-health**: UNKNOWN — not run — Podman not reachable
- **ollama-model**: UNKNOWN — not run — Podman not reachable
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured from a dirty working tree. See `source/git-status.txt` and `source/diff.patch` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture.
