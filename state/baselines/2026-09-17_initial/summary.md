# Baseline: 2026-09-17_initial

## Generic summary (from manifest.yaml)

- Purpose: Initial baseline before any infrastructure is implemented — prompts/, scripts/, security/ authored, nothing built yet
- Captured at: 2026-09-17T08:44:57Z (UTC)
- Source commit: `5379ec86e072ab28c9f6c598b97926867934bf49` on branch `main`
- Working tree dirty: true
- Previous baseline: none
- Overall capture status: **CAPTURED**

### Components

| Component | Compose file present | Observed running | Capture status |
|---|---|---|---|
| vault | false | false | CAPTURED |
| infra | false | false | CAPTURED |
| ollama | false | false | CAPTURED |
| api | false | false | CAPTURED |
| agents | false | false | CAPTURED |
| ui | false | false | CAPTURED |

### Verification

- **backend-health**: UNKNOWN — not run — factory-api is not running
- **mutating-scenarios**: UNKNOWN — not run — mutating scenario requires --with-scenarios

See `manifest.yaml`, `source/`, `runtime/`, `components/`, `verification/` for full evidence.

## Project context

This baseline was captured while `prompts/`, `scripts/`, `security/`, and `input/` were still untracked (new project scaffolding from the design phase — see `README.md` and `security/README.md`). No infrastructure has been implemented yet; every component above is honestly absent. This is expected for an initial baseline of a project still being assembled from its own prompts.
