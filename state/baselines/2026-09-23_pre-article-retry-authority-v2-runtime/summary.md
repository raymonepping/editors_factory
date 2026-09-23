# Baseline: 2026-09-23_pre-article-retry-authority-v2-runtime

## Generic summary (from manifest.yaml)

- Purpose: Pre-edit baseline with host runtime access; preceding pre-article capture could not reach Podman from the sandbox
- Captured at: 2026-09-23T08:11:00Z (UTC)
- Source commit: `17269983e39f1465a0dffefa33db6cf8f3264874` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_pre-article-retry-authority-v2
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
