# Release checklist

Use this checklist from a clean, configured development environment. Record any accepted exception in the release notes.

## Scope and repository state

- [ ] Confirm the intended release scope and version.
- [ ] Review `git status --short`; explain or remove every unexpected file.
- [ ] Confirm `state/CURRENT` names the latest completed milestone.
- [ ] Capture a new redacted state baseline if behavior changed after that milestone.
- [ ] Confirm `.env`, `.secrets/`, Vault licenses, Terraform state, credentials, and generated tokens are not tracked.
- [ ] Review `CHANGELOG.md` and move relevant entries from `[Unreleased]` into the version section.

## Static validation

- [ ] Run `make check`.
- [ ] Run `make compose-config`.
- [ ] Run `npm --prefix backend test`.
- [ ] Run `npm --prefix agents test`.
- [ ] Run `npm --prefix ui run typecheck`.
- [ ] Run `npm --prefix ui run build`.
- [ ] Confirm Terraform formatting with `terraform fmt -check -recursive terraform`.
- [ ] Review the documentation result in `docs/writing/DOCS_QUALITY_GATE.md`; all blocking gates must pass.

## Runtime validation

- [ ] Start the stack with `make up`.
- [ ] Run `make status` and confirm all expected containers are healthy.
- [ ] Run `make vault-status`; confirm the main cluster is initialized, unsealed, and has a leader.
- [ ] Confirm `GET /api/health` returns HTTP 200 with healthy Vault and database results.
- [ ] Confirm Ollama lists the configured model.
- [ ] Open the dashboard at `http://localhost:3000` and confirm the event stream connects.
- [ ] Check the dashboard at narrow, laptop, and wide viewport sizes.

## Security demonstration

- [ ] Run `make reset` and confirm baseline factory counts.
- [ ] Run `make demo-bad`.
- [ ] Confirm the A to B to C delegation chain is recorded.
- [ ] Confirm Agent C receives the BAD effective authority and a `factory-bad-role` lease.
- [ ] Confirm harmful allowed behavior produces authority, credential, database-change, and Agent D evidence.
- [ ] Run `make reset`; confirm leases are revoked, evidence is cleared, and domain data returns.
- [ ] Run `make demo-good`.
- [ ] Confirm Agent C receives bounded effective authority and a `factory-good-role` lease.
- [ ] Confirm a destructive request is denied and no destructive database change occurs.
- [ ] Confirm Agent D records containment evidence.
- [ ] Run `make reset` once more and leave the environment clean.

## Documentation and packaging

- [ ] Follow every link from `docs/index.md` and the root `README.md`.
- [ ] Confirm commands, ports, model name, component names, and API paths match current source.
- [ ] Confirm new behavior is documented under `docs/`, not only in a prompt or source comment.
- [ ] Confirm the release contains no local screenshots, smoke-test artifacts, database dumps, or editor files.
- [ ] Review the final diff for generated files and accidental secret-shaped content.

## Tag and publish

- [ ] Commit the reviewed release changes.
- [ ] Create the selected Semantic Versioning tag through the project's approved release workflow.
- [ ] Push the commit and tag.
- [ ] Confirm the GitHub release and its workflow complete successfully.
- [ ] Verify the published tag matches the tested commit.

## After release

- [ ] Restore a fresh `[Unreleased]` section in `CHANGELOG.md` if the release workflow did not do so.
- [ ] Record follow-up defects separately from the released version.
- [ ] Announce the release to the intended audience, if required.
