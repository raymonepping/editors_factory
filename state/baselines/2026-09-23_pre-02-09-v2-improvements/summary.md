# Baseline: 2026-09-23_pre-02-09-v2-improvements

## Generic summary (from manifest.yaml)

- Purpose: Before 02_09: independent Vault-side revocation verification, documented ledger/mutation atomicity tradeoff, minimal local OTel tracing for v2 attempt lifecycle
- Captured at: 2026-09-23T09:39:23Z (UTC)
- Source commit: `f98cfe6d62abb6370a13626b2e7b1bb7a6dca428` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_post-article-retry-authority-v2
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
