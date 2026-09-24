# Baseline: 2026-09-24_post-vault-2.1.1-upgrade

## Generic summary (from manifest.yaml)

- Purpose: Vault upgraded 2.1.0-ent -> 2.1.1-ent; v3 Agentic IAM re-tested, NO-GO confirmed; stack recovered from force-recreate blast-radius incident during re-test
- Captured at: 2026-09-24T14:29:18Z (UTC)
- Source commit: `6798bb11980a4d50919b5b4e7f342852b6781542` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-24_pre-vault-2.1.1-upgrade
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
