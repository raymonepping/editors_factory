# Baseline: 2026-09-23_vault-agent-stall-recovery

## Generic summary (from manifest.yaml)

- Purpose: Fixed and live-verified: vault-agent's AppRole token silently stopped renewing after ~4 hours, causing every write route to fail with 'password authentication failed' while /api/health falsely reported ok. Forced fresh re-auth, recreated factory-api + agents, recovered a compounding vault-s seal/vault-1 unreachable issue from the recreate's broader-than-expected blast radius using make vault-unseal. Profile switch confirmed working live via Playwright; full backend suite 33/33.
- Captured at: 2026-09-23T16:10:11Z (UTC)
- Source commit: `44deb989a41d2a6dc077326ffa24a9b38e5cc666` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_sse-keepalive-fix
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
