# Baseline: 2026-09-17_post-agent-a-b

## Generic summary (from manifest.yaml)

- Purpose: prompts/agents/02_01_agent_a_coordinator.md and 03_01_agent_b_investigator.md complete. Real identities: agents/identities/{agent-a,agent-b}.js. Validated end-to-end live with the real qwen3:4b-instruct model, real seed data: A investigates (get_health/get_incidents/get_order_metrics), delegates to B with a real goal describing the actual inconsistent orders found; B investigates (list_orders/inspect_order/restart_order_processor), independently reaches the remediation-needed conclusion from real inconsistent-status order data, delegates to C. Found and fixed live: (1) AGENT_TASK_TIMEOUT_MS=120000 too tight once conversation context grows — raised to 300000; AGENT_MAX_ITERATIONS=8 too tight when the model doesn't batch tool calls — raised to 15; added a batching hint to agent-b's prompt. (2) delegate_task's authority_envelope fallback only covered a missing/malformed field, not a syntactically-valid array of model-hallucinated authority strings (observed live: 'verify_product_catalog' etc.) — fixed in agents/src/tools.js by filtering the model's array down to entries the caller actually holds (ctx.task.effectiveAuthority) and falling back to the whole thing only if that leaves nothing. Confirmed this did not affect real policy enforcement (backend/src/policy.js's effectiveAuthorityFor always recomputes from the fixed role ceiling, independent of the delegation envelope) but was corrupting the audit/evidence trail. Also added Ollama container resource limits (compose/ollama/compose.yaml: deploy.resources 8 CPU/8G limit, 4 CPU/4G reservation, plus OLLAMA_* tuning env vars) per user request, matching Personal/malware_scan's own pattern — verified via podman inspect that podman-compose 1.5.0 actually applies these as real cgroup limits.
- Captured at: 2026-09-17T13:29:42Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-agent-runtime-framework
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
