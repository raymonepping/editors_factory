# Baseline: 2026-09-23_post-v2-02-08-improvements

## Generic summary (from manifest.yaml)

- Purpose: After 02_08: genuine PostgreSQL lock_timeout contention (BAD-only, empirically confirmed GOOD's SELECT-only grants cannot hold any conflicting lock), permanent insert_product/delete_products test coverage — found and fixed a serious live bug where fault injection ran after the business-effect ledger claim, permanently poisoning retries
- Captured at: 2026-09-23T06:35:51Z (UTC)
- Source commit: `54ce70ca795d7c7b78a015f4b3c070338ce4c293` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_pre-v2-02-08-improvements
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
