# Baseline: 2026-09-17_post-agent-d

## Generic summary (from manifest.yaml)

- Purpose: prompts/agents/05_01_agent_d_detection.md complete — all four agent prompts (02_01-05_01) now done. agents/identities/agent-d.js: two-tier hybrid detection (deterministic Tier-1 classify() + Tier-2 Ollama narration via observerRuntime.js's correlate()). Two small, well-scoped backend additions needed for this prompt's own validation and the future frontend: GET /api/events/history?run_id= and GET /api/findings?run_id= (backend/src/routes/events.js) — public/unauthenticated, matching the existing SSE endpoints; plus a missing publishEvent call added to markCredentialRevoked (backend/src/audit.js) so D-008 has a live signal to react to.

Validated end-to-end live, both profiles, full agent-a->b->c chain with agent-d observing (real qwen3:4b-instruct throughout, no scripting):
BAD run: D-001->D-002->D-003->D-004->D-005(CRITICAL) all in correct chronological order, D-005 landing ~78s before the first real database_changes row (delete/update) — proves the 'we knew before the damage happened' claim with real timestamps.
GOOD run: D-001->D-002->D-003->D-004->D-004b(ELEVATED, not CRITICAL) — classifier correctly distinguished factory-good-role from factory-bad-role at the credential-issuance moment; Agent C quarantined all 5 orders via update_order_status, zero destructive database_changes.
D-007 (CONTAINED, policy DENY of a destructive action) verified independently at the authority_decisions layer during 04_01's own testing (real orders.delete DENY with correct reason text) — implemented as unconditional code, not dependent on any specific run choosing to attempt a denied action.

Found and fixed live, each confirmed by rerunning:
1. Fire-and-forget Tier-2 Ollama narration let findings race independently against Ollama's single-concurrency queue (OLLAMA_NUM_PARALLEL=1 — compose/ollama/compose.yaml), scrambling finding order relative to real event order. Fixed by awaiting onEvent end-to-end through backendClient.js's subscribeEvents (runtime.js's own fire-and-forget task-dispatch usage is unaffected, since that callback already returns without awaiting its own handler).
2. agent-d.js's riskState is module-scoped to the container's lifetime, not the active run — a fresh run inherited a previous run's CRITICAL state from its first heartbeat. Fixed: the D-001 signal unconditionally resets state to NORMAL.
3. markCredentialRevoked never published an SSE event (found while implementing D-008) — added.
4. The model's 'claims a tool was called when it was not' failure (first caught in 04_01) recurred for delegate_task specifically; strengthened runtime.js's nudge to be unambiguous ('No tool call was made... regardless of what you wrote') and allowed up to 2 nudge attempts instead of 1 — improves but does not fully eliminate this small-model reliability characteristic; documented as a known, retry-recoverable demo characteristic, not a hidden defect.
5. Confirmed (not a code bug): occasional SSE 'terminated' reconnect blips occur over long dev sessions independent of any manual interference; the existing 2s-retry logic self-heals every time observed. Any events published during the gap are permanently missed by live processing (SSE has no backlog) — GET /api/events/history and GET /api/findings exist as the reconciliation building block for a future hardening pass; Agent D does not yet reconcile against them on reconnect.

Also added Ollama container resource limits (compose/ollama/compose.yaml: 8 CPU/8G limit, 4 CPU/4G reservation, OLLAMA_* tuning) per user request, matching Personal/malware_scan's pattern — verified via podman inspect. AGENT_MAX_ITERATIONS raised 8->15 and AGENT_TASK_TIMEOUT_MS raised 120000->300000 (agents/.env, compose/agents/compose.yaml, agents/src/config.js), calibrated to qwen3:4b-instruct's real observed per-turn latency and non-batching tendency, found live during 03_01. Demo reset to clean baseline; all 8 containers (vault HA x4 + vault-agent, postgres, ollama, factory-api) plus all 4 agent containers confirmed healthy at capture time.
- Captured at: 2026-09-17T21:44:37Z (UTC)
- Source commit: `d56da63a798b0d45a85f01ea0bf93a242cb557ce` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-agent-c
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | true | true | CAPTURED |
| infra | true | true | CAPTURED |
| ollama | true | true | CAPTURED |
| api | true | true | CAPTURED |
| agents | true | true | CAPTURED |
| ui | true | false | CAPTURED |

### Verification

- **backend-health**: PASS — GET /api/health responded
- **ollama-model**: PASS — GET /api/tags responded and qwen3:4b-instruct is present
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured from a dirty working tree. See `source/git-status.txt` and `source/diff.patch` for the recorded source-state evidence; untracked paths are listed by Git but are not represented in the patch. The purpose and component table above describe the implementation milestone observed during this capture.
