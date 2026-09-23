# Baseline: 2026-09-23_sse-keepalive-fix

## Generic summary (from manifest.yaml)

- Purpose: Fixed and live-verified: all four agents (a/b/c/d) were dropping their SSE connection to factory-api every ~5 minutes due to Podman's own idle-connection reaping, not an app bug. Added a 15s SSE keepalive ping. Watched a full 7-minute window post-fix with zero drops. This is the real explanation for Discovery sometimes producing zero findings on an otherwise-successful run — events fired during a reconnect gap were never replayed.
- Captured at: 2026-09-23T12:59:58Z (UTC)
- Source commit: `5cc0e499a65fe1ccb5aff7907c790dd05f502065` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_vault-agent-in-make-up
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
