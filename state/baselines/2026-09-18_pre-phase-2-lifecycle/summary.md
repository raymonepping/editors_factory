# Baseline: 2026-09-18_pre-phase-2-lifecycle

## Generic summary (from manifest.yaml)

- Purpose: Pre-Phase 2 baseline (Credential & Token Lifecycle)
- Captured at: 2026-09-18T09:06:34Z (UTC)
- Source commit: `f81541b9dbaf4af507f03d8368e4716490b9f8fa` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-18_post-responsive-scaling
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
