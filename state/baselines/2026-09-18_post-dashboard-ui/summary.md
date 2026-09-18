# Baseline: 2026-09-18_post-dashboard-ui

## Generic summary (from manifest.yaml)

- Purpose: prompts/frontend/01_01_factory_dashboard_ui.md complete, visual identity per prompts/frontend/01_00_factory_design_spec.md. Nuxt 4 + Vue 3 + Tailwind v4 single-page dashboard at ui/ — 7 components (HumanRequest, AgentChain, AuthorityPanel, FactoryState, EventTimeline, AgentDLane, ProfileSwitch) + FactoryMetric as a legitimate internal sub-component, 2 composables (useDemoApi.ts typed REST client, useEventStream.ts the single live-state source built on native browser EventSource against factory-api's SSE stream). Design tokens in app/assets/css/main.css implement 01_00's semantic token contract verbatim.

Architecture decision: the browser connects DIRECTLY to factory-api's published port (no server-side proxy) per 01_01's own explicit text ('via a published port for the browser's own SSE connection') — required two small, well-scoped backend additions: (1) permissive CORS middleware in backend/src/index.js (no credentials/cookies ever involved — this UI has no login), (2) GET /api/factory-state (backend/src/routes/factoryState.js, new) for the Factory State region's live counters, computed from real orders/products/inventory/database_changes queries, not fabricated. Also extended the existing GET /api/events/history to UNION all five evidence tables (audit_events, authority_decisions, credential_events, database_changes, delegations) tagged by type, giving the timeline a proper unified backfill on page load instead of only audit_events.

Validated for real, repeatedly, against the actual built container (not just dev server): npm run typecheck (clean), npm run build (clean), podman build + make ui-up (factory-ui healthy), then live Playwright-driven browser checks at 1920x1080, 1280x800, and 390x844 (mobile) against the real running stack — zero console errors, zero hydration warnings, at every viewport. Confirmed live and working: idle state with real backfilled data, clicking Run creates a genuine new backend task (task.created audit_events row) and the agent chain visibly resets and reasons, switching to BAD mode instantly highlights agent-c's destructive authority entries in red (the actual 'authority amplification is visible at the exact causal moment' requirement from 01_00's own acceptance checklist), the event timeline's gold-leading-edge/blue-grey-historical treatment updates live with a real delegation row visible mid-chain, and Agent D's lane shows real findings (D-001, D-002, ...) with correct severity coloring. Confirmed a floating element visible during manual dev-mode screenshots was purely Nuxt DevTools' own overlay (absent from the production build screenshot — verified side by side).

Found and fixed live: the Factory State metric grid (5 metrics in a 3-column auto-fit CSS grid) left one dangling empty cell at mobile width — added an explicit 2-column breakpoint at <=480px.

Deliberately deferred, per prompts/frontend/01_01's own text ('Follow prompts/process/00_05_frontend_design_toolchain.md's toolchain ... once this initial build exists ... this prompt produces the working application; that later prompt audits and refines it'): prompts/process/00_05 (Playwright CLI formal install + skills, Impeccable, Taste Skill, Awesome DESIGN.md references, docs/frontend/config/DESIGN.md, docs/frontend/BASELINE.md/UI_AUDIT.md/UI_IMPROVEMENT_PLAN.md/UI_TOOLCHAIN_REPORT.md) and 00_06 (the formal quality-gate report) were read and analyzed but not executed this pass — both explicitly assume a first working build already exists to audit, which is exactly what this capture represents. A minimal @playwright/test devDependency + chromium browser was installed locally to perform this prompt's OWN validation section, not to satisfy 00_05.
- Captured at: 2026-09-18T05:46:32Z (UTC)
- Source commit: `d56da63a798b0d45a85f01ea0bf93a242cb557ce` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-17_post-agent-d
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
