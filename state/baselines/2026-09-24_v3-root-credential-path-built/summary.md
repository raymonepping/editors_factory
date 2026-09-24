# Baseline: 2026-09-24_v3-root-credential-path-built

## Generic summary (from manifest.yaml)

- Purpose: v3 built as a real, separate root-scoped Vault-native OAuth credential path (prompts/v3/03_01) — corrected the earlier NO-GO verdict, proven end-to-end through the deployed backend, v1/v2 confirmed untouched throughout
- Captured at: 2026-09-24T18:15:59Z (UTC)
- Source commit: `e4d8cb12ec650a2a54dfe31e0951d6b48a4ca14a` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-24_pre-v3-root-credential-path
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
