# Baseline: 2026-09-25_pre-vault-agent-hardening

## Generic summary (from manifest.yaml)

- Purpose: Before hardening vault-agent health checks and the recreate-cascade dependency (prompts/hardening/01_00)
- Captured at: 2026-09-25T06:20:54Z (UTC)
- Source commit: `eec365773b50faf3cbca964f40f8b43d6ef56d27` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-25_recovered-vault-agent-stale-token
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
