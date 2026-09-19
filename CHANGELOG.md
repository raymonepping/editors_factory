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

### Fixed

- `ui/app/app.vue` never wrapped `<NuxtPage>` in `<NuxtLayout>`, so a named layout was never applied regardless of `definePageMeta`. Fixed as part of adding the sidebar layout.
- The dashboard footer used `position: fixed`, permanently consuming viewport height on every screen (confirmed via Playwright at both target demo resolutions) and producing a full-page-screenshot rendering artifact on narrow viewports. It is now a normal in-flow footer.
- `docs/architecture.md` described dashboard reads as unauthenticated; the dashboard has required a Keycloak session since Wave 7.
- `docs/operations.md`'s `make up` stack list omitted `identity`.

### Security
