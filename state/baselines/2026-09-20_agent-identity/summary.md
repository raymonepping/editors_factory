# Baseline: 2026-09-20_agent-identity

## Generic summary (from manifest.yaml)

- Purpose: Display-only agent identity rename (prompts/improvements/01_05_add_identity.md): Assistant/Investigator/Corrector/Discovery introduced as friendly display names across the dashboard (Agent Chain, Authority Panel, sidebar, Agent D lane, live narrative) and Discovery's own finding titles (D-001/D-002/D-003/D-005), plus narrative-facing docs (demo-guide.md, project-history.md) and the STYLE.md terminology table documenting the split between friendly names (narrative surfaces) and Agent A-D (technical/reference surfaces: api-reference.md, release-checklist.md, troubleshooting.md, architecture.md, security-model.md, security/*, all left unchanged). No internal identifier (actor_id, JWT sub, Sentinel metadata, container/file/env names) changed anywhere -- confirmed via full grep sweep. Agent system prompts (agents/identities/agent-a.js etc, the literal LLM-facing 'You are Agent A' text) deliberately left untouched as out of this pass's display-only scope. Verified live: rebuilt both the UI and agents container images (a plain --force-recreate does not pick up source changes for either, since both build from a Containerfile), watched a real BAD run render the new labels and all three finding titles end to end. Backend 24/24, agent 5/5, ui build all pass.
- Captured at: 2026-09-19T22:03:37Z (UTC)
- Source commit: `b1d3d75d45d50cca8e21c63b06ca1244efc7da39` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-19_vault-hardening-complete
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
