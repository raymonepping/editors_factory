# Baseline: 2026-09-22_pre-v2-02-07-validation

## Generic summary (from manifest.yaml)

- Purpose: Before implementing 02_07: Makefile demo-v2-bad/demo-v2-good targets, fault injection enforcement, acceptance criteria
- Captured at: 2026-09-22T16:40:52Z (UTC)
- Source commit: `e17fcf240223471881c98e5aa8f73716e73506d8` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_post-v2-02-06-frontend
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
