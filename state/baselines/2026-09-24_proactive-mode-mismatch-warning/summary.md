# Baseline: 2026-09-24_proactive-mode-mismatch-warning

## Generic summary (from manifest.yaml)

- Purpose: Closed the recurring workflow-mode ordering trap properly on the third report: GET/PUT /api/demo/mode now expose the current run's own stored workflow_mode; dag.vue fetches it fresh on mount and shows a specific warning before the click instead of only after a failed one. Live-verified with Playwright end to end. Also confirmed the SSE keepalive fix from the prior session is holding at 17+ hours with zero drops -- this was never a timeout/sleep issue.
- Captured at: 2026-09-24T08:37:16Z (UTC)
- Source commit: `84e6fd342c177bb1da37ccd7f6f43a186265696b` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-23_vault-agent-stall-recovery
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
