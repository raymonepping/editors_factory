# Baseline: 2026-09-21_agentic-iam-hardening-phase3

## Generic summary (from manifest.yaml)

- Purpose: 01_08 Phase 3: delegation-chain JWT claims. signAgentToken now embeds delegated_by (human operator or upstream agent). Live-verified: agent-a's real JWT shows delegated_by=local-operator, agent-c's shows delegated_by=agent-b, both confirmed accurate against the real delegations table. Backward-compatible, additive claim. Both test suites pass.
- Captured at: 2026-09-21T07:11:21Z (UTC)
- Source commit: `983db2e259938317d47d715155a1ca23aaec8dcc` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-21_agentic-iam-hardening-phase2
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
