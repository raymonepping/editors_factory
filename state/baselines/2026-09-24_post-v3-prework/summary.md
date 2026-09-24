# Baseline: 2026-09-24_post-v3-prework

## Generic summary (from manifest.yaml)

- Purpose: v3 prework spike complete: NO-GO verdict, live-verified. Vault's sys/config/oauth-resource-server (Agentic IAM) is entitled and configurable on this build but nothing consumes a validated JWT to authenticate a request yet -- confirmed via three separate live probes against the audit log, not assumed. Full findings in prompts/v3/03_00_findings.md; durable verdict recorded as DESIGN.md decision #14. All spike infrastructure (Keycloak client, Vault profile, one narrow policy grant) left in place, strictly additive. v1/v2 fully undisturbed: backend 33/33, agents 10/10, live health clean.
- Captured at: 2026-09-24T10:06:34Z (UTC)
- Source commit: `15afd02d228dd41b15134eeca9e5a4ee5023ba18` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-24_pre-v3-prework
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
