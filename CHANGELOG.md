# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Dashboard sidebar navigation (`prompts/frontend/01_02_dashboard_navigation_and_sidebar.md`): Overview, Records, Credentials, Timeline, and Agent D are now separate sections behind a persistent control-room sidebar, replacing one long stacked page. Overview keeps only the human request, agent chain, narrative, factory state, and effective authority; the sidebar shows a live Agent D risk dot, active-credential dot, and event count without visiting those sections.
- `docs/validation/FINAL_VALIDATION_01_03.md`: a full acceptance and evidence audit of the running system against `prompts/improvements/01_03_validation.md`, with a `PASS WITH DEFERRED ITEMS` verdict.

### Changed

- `docs/getting-started.md`, `docs/demo-guide.md`, `docs/architecture.md`, `docs/operations.md`, `docs/project-history.md`, and `README.md` updated to describe the Keycloak/OpenLDAP identity stack (sign-in requirement, `make identity-bootstrap`, `FACTORY_CLI_OPERATOR_TOKEN`) and the new dashboard navigation, none of which were previously documented.

### Deprecated

### Removed

- `ui`'s explicit top-level `vue-router` dependency (`^4.5.1`). Nuxt 4.5 bundles its own `vue-router@5.x` internally and the app itself only ever used Nuxt's auto-imported `useRoute`/`useRouter`; the redundant explicit v4 dependency was the direct cause of `npm --prefix ui run typecheck` crashing outright (see Fixed).

### Fixed

- `ui/app/app.vue` never wrapped `<NuxtPage>` in `<NuxtLayout>`, so a named layout was never applied regardless of `definePageMeta`. Fixed as part of adding the sidebar layout.
- The dashboard footer used `position: fixed`, permanently consuming viewport height on every screen (confirmed via Playwright at both target demo resolutions) and producing a full-page-screenshot rendering artifact on narrow viewports. It is now a normal in-flow footer.
- `docs/architecture.md` described dashboard reads as unauthenticated; the dashboard has required a Keycloak session since Wave 7.
- `docs/operations.md`'s `make up` stack list omitted `identity`.
- `npm --prefix ui run typecheck` crashed outright on a `vue-router`/`@vue/language-core` package-export mismatch (two different `vue-router` majors in the dependency tree — see Removed) and never produced a real type-check result. It now runs to completion; fixing it surfaced 5 genuine type errors in `AppSidebar.vue` (an array literal's inferred element type didn't cover the `risk` field added for the Agent D nav item), now fixed with an explicit `SidebarItem` type.
- Agent D's `classify()` matched `credential_events` on `vault_role` alone, so `D-005`/`D-004b` re-fired on every later re-broadcast of the same credential (issuance, each renewal, and revocation all publish the full row) — observed live as `D-005` recorded 3x for one credential in a single run. The same bug made `D-008` (revocation) unreachable dead code, since the credential_events block above it matched every message first. Now fires only on genuine first issuance; revocation correctly reaches `D-008`. Added `agents/test/agent-d-classify.test.js` as a regression test.
- `POST /api/demo/reset` could race a concurrently-writing `factory-agent-d` (found live, 1/5 backend test runs): under READ COMMITTED, a `create_finding` insert landing between reset's own `DELETE FROM audit_events` and `DELETE FROM demo_runs` statements made the later statement fail an FK check on a row that didn't exist when the batch started, aborting the whole reset. The reset transaction now runs at `REPEATABLE READ`, so it takes one snapshot at its first statement and a concurrent commit from another connection becomes invisible to the rest of it — 8/8 clean `npm --prefix backend test` runs afterward (previously 1-in-5 flaky).
- The backend's own Vault-issued Postgres credential could go stale after a long run with no automatic recovery short of restarting the container (root cause never conclusively established). `GET /api/health` now triggers an immediate out-of-band renewal the moment it observes `db.ok: false` (`backend/src/db.js`'s new `renewNow`), and every renewal attempt — success or failure — is now logged, where previously only failures were.

### Security
