# Writing improvement plan

This plan records the work completed during the 2026-09-18 documentation pass and the remaining release-facing work.

## Completed

- [x] Replace the root README with a current project overview and clear entry path.
- [x] Add `docs/index.md` with guided and reference navigation.
- [x] Document clean setup, Vault bootstrap, Terraform application, and service startup.
- [x] Document components, networks, task flow, evidence, and deliberate limits.
- [x] Document effective authority, credential brokerage, Sentinel, PostgreSQL grants, and reset boundaries.
- [x] Provide repeatable BAD and GOOD profile procedures.
- [x] Document routine operations and known failure modes found during implementation.
- [x] Provide an API route reference with authentication boundaries.
- [x] Preserve design evolution in a history that marks early material as historical.
- [x] Expand the release checklist to cover source, runtime, security, and documentation checks.
- [x] Refresh style and quality policies for the mature corpus.

## Release blockers discovered during validation

- [ ] Add backend tests or remove the broken `npm test` contract. `node --test test/` currently fails because `backend/test/` does not exist.
- [ ] Add agent tests or remove the broken `npm test` contract. `node --test test/` currently fails because `agents/test/` does not exist.
- [ ] Format `terraform/vault-database/main.tf` and `terraform/vault-platform/main.tf`; `terraform fmt -check -recursive terraform` currently fails.
- [ ] Resolve the UI type-checker's `vue-router/volar/sfc-route-blocks` resolution error. The command currently exits zero despite printing the error.

These items require source or dependency changes outside this documentation task. The release checklist keeps them visible.

## Future maintenance

- Update the API reference when a route or authentication boundary changes.
- Update setup instructions when provisioning becomes a single supported command.
- Add a Factory-specific runtime verification script; do not adapt the retained arcanium script by search-and-replace.
- Refresh screenshots only if the project begins shipping them as documentation.
- Rerun the full documentation gate before each release.
