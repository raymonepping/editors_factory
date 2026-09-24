# Baseline: 2026-09-24_pre-v3-root-credential-path

## Generic summary (from manifest.yaml)

- Purpose: Before building v3's separate, root-namespace credential path (prompts/v3/03_01) — v1/v2 must remain untouched throughout
- Captured at: 2026-09-24T17:25:13Z (UTC)
- Source commit: `e42d7cd2d99f3d5b4a69f721dea0a30c5cc155c2` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-24_post-vault-2.1.1-upgrade
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
