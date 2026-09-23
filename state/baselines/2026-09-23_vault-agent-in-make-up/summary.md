# Baseline: 2026-09-23_vault-agent-in-make-up

## Generic summary (from manifest.yaml)

- Purpose: vault-agent is now part of make vault-up's own dependency chain — closes the long-standing gotcha #8 permanently. Live-verified: stopped/removed factory-vault_agent, make vault-up brought it back automatically, healthy.
- Captured at: 2026-09-23T12:23:23Z (UTC)
- Source commit: `87f059bfcb86618a09a8dfe4bcc79de5a52e4a62` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_ui-dag-retry-error-fix
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
