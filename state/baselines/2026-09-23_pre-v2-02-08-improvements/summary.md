# Baseline: 2026-09-23_pre-v2-02-08-improvements

## Generic summary (from manifest.yaml)

- Purpose: Before implementing 02_08: real lock_timeout fault injection, live-testing insert_product/delete_products
- Captured at: 2026-09-23T06:08:33Z (UTC)
- Source commit: `95b75b28003bf32c33a158efbfbf05030b729ceb` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_post-v2-02-07-validation
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
