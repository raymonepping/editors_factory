# Baseline: 2026-09-22_pre-v2-02-01-schema

## Generic summary (from manifest.yaml)

- Purpose: Before implementing 02_01: v2 Postgres schema (dag_runs/dag_nodes/dag_edges/dag_node_attempts/dag_business_effects) + demo_runs ALTER
- Captured at: 2026-09-22T13:23:43Z (UTC)
- Source commit: `8f9a7c5427697cf873a718af02f869aae78367c3` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_post-v2-02-00-architecture
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | true | true | CAPTURED |
| infra | true | true | CAPTURED |
| ollama | true | true | CAPTURED |
| api | true | true | CAPTURED |
| agents | true | true | CAPTURED |
| ui | true | true | CAPTURED |

### Verification

- **backend-health**: PASS — GET /api/health responded
- **ollama-model**: PASS — GET /api/tags responded and qwen3:4b-instruct is present
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured from a dirty working tree. See `source/git-status.txt` and `source/diff.patch` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture.
