# Baseline: 2026-09-22_agentic-iam-hardening-complete

## Generic summary (from manifest.yaml)

- Purpose: 01_08 Agentic-IAM-Inspired Hardening complete (all 5 phases). Phase 1: Vault audit-log cross-check tooling. Phase 2: task-scoped Sentinel check. Phase 3: delegation-chain JWT claims. Phase 4: Vault Control Groups supervised credential path for a second-credential-in-one-run anomaly, with a real human-gated dashboard approval flow, live-verified end to end including Playwright screenshots. Phase 5: reasoned, live-grounded recommendation not to build SPIFFE now (infrastructure disproportionate to the one credential it would replace). Full test suites pass throughout (24/24 backend, 10/10 agents). Article and docs (security-model.md, demo-guide.md, operations.md) updated to match.
- Captured at: 2026-09-22T10:53:51Z (UTC)
- Source commit: `7ffd1cc91b03005fe9b72fbeb79768a1f46355d7` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_agentic-iam-hardening-phase4
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
