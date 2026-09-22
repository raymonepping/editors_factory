# Baseline: 2026-09-22_post-v2-02-01-schema

## Generic summary (from manifest.yaml)

- Purpose: After 02_01: v2 DAG schema (009_v2_dag_tables.sql) applied and live-verified against factory-postgres; full stack restarted mid-task after Podman resource exhaustion
- Captured at: 2026-09-22T13:31:48Z (UTC)
- Source commit: `dcc5176d079ec67fae5bbfee060296e9ecf547ae` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_pre-v2-02-01-schema
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
