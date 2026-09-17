# Baseline: 2026-09-17_post-agent-runtime-framework

## Generic summary (from manifest.yaml)

- Purpose: prompts/agents/01_01_agent_runtime_framework.md complete: shared agent runtime (agents/src/{config,backendClient,ollamaClient,tools,runtime,observerRuntime,heartbeat,index}.js), Containerfile, compose/agents/compose.yaml (4 services from one shared image, differentiated by AGENT_IDENTITY, each carrying only its own bearer token). Validated end-to-end with a temporary throwaway agent-a identity stub (removed after testing, per the deliverables tree's own attribution of agents/identities/agent-a.js to prompt 02_01): real SSE-based task dispatch, GET /api/tasks/:id fetch, live Ollama qwen3:4b-instruct tool-calling across a 3-iteration reasoning loop (get_health/get_incidents/get_order_metrics), and a correct delegate_task call to agent-b with the authority-envelope fallback producing the expected delegations row. Also verified the real Ollama /api/chat tool-calling wire format directly (tool_calls[].function.{name,arguments} as an object, and a tool-result round-trip) before trusting ollamaClient.js's assumptions. Found and fixed live: a bare unresolved Promise does not hold Node's event loop open, so the 'identity not yet built' parking path was silently exiting and restart-looping until replaced with a real setInterval-based keep-alive.
- Captured at: 2026-09-17T13:06:49Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-credential-ttl-fix
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
