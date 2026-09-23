# Baseline: 2026-09-23_post-02-09-v2-improvements

## Generic summary (from manifest.yaml)

- Purpose: 02_09 complete: independent Vault-side revocation verification (--verify-revocation), documented ledger/mutation atomicity tradeoff, minimal local OTel tracing across the v2 attempt lifecycle. All live-verified; full backend (33/33) and agents (10/10) suites pass.
- Captured at: 2026-09-23T10:08:11Z (UTC)
- Source commit: `484abebdbff9dc1a79d1dd74990cd1b1e2e40adc` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_pre-02-09-v2-improvements
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
