# Baseline: 2026-09-22_agentic-iam-hardening-phase4

## Generic summary (from manifest.yaml)

- Purpose: 01_08 Phase 4: Vault Control Groups supervised credential path complete. A second credential request in one run is withheld by Vault (wrap_info, not the credential) until a human authorizes it via a dedicated control-group-authorizer identity, never held standing. Two real bugs found and fixed live: Control Group approval requires the original requesting child token to stay valid through unwrap (fixed with a dedicated 30-min approval window, not the DB role's own short TTL), and the authorizer's own token must survive through unwrap too (fixed by not revoking it early). New dashboard UI (PendingApprovals.vue) verified via Playwright screenshots. Audit cross-check tool extended to honestly report the Control-Group delivery path. Live-verified end to end through the real API, dashboard, and both test suites (24/24 backend, 10/10 agents).
- Captured at: 2026-09-22T10:51:50Z (UTC)
- Source commit: `0090d89f677c92a2d6c60ad525247d085e214199` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-21_agentic-iam-hardening-phase3
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
