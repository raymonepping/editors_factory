# Documentation quality gate

Executed on 2026-09-18 against the root `README.md` and first-party Markdown under `docs/`.

## Decision

**Documentation decision: PASS.** All blocking documentation gates pass.

**Project release decision: BLOCKED.** Repository validation found missing backend and agent test directories, two Terraform formatting failures, and a UI type-check dependency error. Those issues require changes outside this documentation task.

## Gate results

| Gate | Result | Evidence |
| --- | --- | --- |
| Structural integrity | PASS | 18 first-party files; one H1 each, ordered headings, balanced fences |
| Link integrity | PASS | All relative paths and heading fragments resolve |
| Vale | PASS | 88 advisory warnings; no errors or suggestions |
| AI-pattern audit | PASS | High-signal matches occur only in rule examples and the audit command itself |
| Technical accuracy | PASS | Checked against source, configuration, latest state, and running services |
| Freshness | PASS | Current baseline is `2026-09-18_post-responsive-scaling`; docs describe the implemented four-agent stack |
| Cross-reference completeness | PASS | Root README and `docs/index.md` expose every release-facing guide |
| Style contract | PASS | Technical, evidence-led voice; no marketing prose |
| Terminology | PASS | Profile, authority, identity, role, and lease terms follow `STYLE.md` |
| Readability | PASS | Procedures follow execution order and reference material uses tables where useful |

## Commands and observations

### Documentation checks

```sh
vale README.md docs
```

Vale warnings were reviewed. Most flag passive voice where the controlled object is the focus, such as a request being denied or a lease being issued. No warning hides an unsafe command or incorrect claim.

A Node.js read-only checker validated H1 count, heading order, fence balance, relative paths, and Markdown heading fragments. A focused pattern scan checked the high-signal terms named by the project-local editorial skill.

### Repository checks

```sh
make help
make compose-config
terraform fmt -check -recursive terraform
npm --prefix backend test
npm --prefix agents test
npm --prefix ui run typecheck
```

Results:

- `make help` and `make compose-config` passed.
- Terraform formatting failed for `terraform/vault-database/main.tf` and `terraform/vault-platform/main.tf`.
- Backend tests failed because `backend/test/` does not exist.
- Agent tests failed because `agents/test/` does not exist.
- UI type-check returned exit code zero but printed a `vue-router/volar/sfc-route-blocks` package-export resolution error. The release gate treats that output as a failure.

### Running-system spot check

```sh
make status
curl -fsS http://localhost:3001/api/health
curl -fsS http://localhost:3001/api/demo/mode
curl -fsS http://localhost:11434/api/tags
```

All expected Factory containers reported healthy. The API reported healthy Vault and database connections, the active profile was GOOD, and Ollama listed `qwen3:4b-instruct`.

## Accuracy sample

The spot check traced these claims to implementation:

- stack order and routine commands to `Makefile`;
- ports, networks, images, and mounts to `compose/*/compose.yaml`;
- configuration and default model to `.env.example`;
- API paths and authentication to `backend/src/routes/` and middleware;
- authority behavior to `backend/src/policy.js` and delegation routes;
- Vault roles and Sentinel metadata enforcement to `terraform/`;
- domain and evidence tables to database migrations;
- agent responsibilities to `agents/src/agents/`;
- implementation discoveries to current comments and captured state.

## Exceptions

The docs do not claim that `scripts/verify-stack.sh` validates The Factory. The script remains inherited arcanium reference code and says it has not been adapted.

The setup guide documents the current staged bootstrap rather than implying that a clean checkout can use one command. The release checklist keeps the uncovered source and dependency blockers visible.
