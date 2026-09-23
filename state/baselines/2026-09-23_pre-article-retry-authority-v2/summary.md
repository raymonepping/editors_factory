# Baseline: 2026-09-23_pre-article-retry-authority-v2

## Generic summary (from manifest.yaml)

- Purpose: Before strengthening the Claude retry-authority article into version 2; editorial work only
- Captured at: 2026-09-23T08:10:20Z (UTC)
- Source commit: `17269983e39f1465a0dffefa33db6cf8f3264874` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_post-docs-01-update-for-v2
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | true | false | CAPTURED |
| infra | true | false | CAPTURED |
| ollama | true | false | CAPTURED |
| api | true | false | CAPTURED |
| agents | true | false | CAPTURED |
| ui | true | false | CAPTURED |

### Verification

- **backend-health**: UNKNOWN — not run — Podman not reachable
- **ollama-model**: UNKNOWN — not run — Podman not reachable
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured from a dirty working tree. See `source/git-status.txt` and `source/diff.patch` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture.
