# Baseline: 2026-09-23_post-docs-01-update-for-v2

## Generic summary (from manifest.yaml)

- Purpose: All 15 in-scope docs + new docs/v2-whats-new.md updated for v2 (prompts/docs/01_update_docs_for_v2.md), no-ai-slop applied, one draft inaccuracy about Control-Group retry bypass direction caught and corrected against credentials.js before commit
- Captured at: 2026-09-23T06:46:25Z (UTC)
- Source commit: `2d9ad5f4f32103c77b9d43023fb80e6740465900` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_pre-docs-01-update-for-v2
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
