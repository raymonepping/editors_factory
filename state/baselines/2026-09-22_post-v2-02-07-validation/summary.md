# Baseline: 2026-09-22_post-v2-02-07-validation

## Generic summary (from manifest.yaml)

- Purpose: After 02_07: deterministic fault injection, demo-v2-good/demo-v2-bad/test-v2-e2e Makefile targets, 7-test acceptance suite — all v2 prompts (02_00-02_07) now complete. Live-verified fail_after_mutation with a real persisted mutation and correctly-intercepted retry; fixed a real evaluateRunCompletion bug found by the new failed-status test
- Captured at: 2026-09-22T16:51:45Z (UTC)
- Source commit: `4890cc636e9610f63dab01fd684b04ae15185a19` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-22_pre-v2-02-07-validation
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
