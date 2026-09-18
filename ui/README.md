# factory-ui

The Factory's dashboard — a single-screen Nuxt/Vue control room for the
delegated-authority demo. Built by `prompts/frontend/01_01_factory_dashboard_ui.md`,
visual identity from `prompts/frontend/01_00_factory_design_spec.md`.

## Local development

```bash
npm install
npm run dev
```

Requires `factory-api` reachable at `NUXT_PUBLIC_API_BASE` (default
`http://localhost:3001` — see `nuxt.config.ts`). Start the rest of the
stack first: `make up` (or at minimum `make vault-up infra-up ollama-up
api-up agents-up` from the repo root).

## Architecture

- The browser connects **directly** to `factory-api`'s published port —
  both for its live SSE stream (`GET /api/events/stream`, via the native
  `EventSource` API) and for every REST call (`composables/useDemoApi.ts`).
  There is no server-side proxy: this is a local, single-operator demo
  tool with no login, so there is no session to protect behind a
  same-origin boundary. `backend/src/index.js`'s own CORS comment has the
  full reasoning.
- `composables/useEventStream.ts` is the single source of live state —
  every component reads from it, not from its own polling loop. It is a
  module-level singleton: opening the page twice in the same tab still
  shares one SSE connection.
- No destructive action originates client-side. Every control here calls
  a `factory-api` endpoint; the frontend never talks to PostgreSQL,
  Vault, or Ollama directly.

## Design system

`prompts/frontend/01_00_factory_design_spec.md` is the visual source of
truth. `app/assets/css/main.css` implements its semantic token contract
verbatim — components reference `var(--color-*)` custom properties, never
raw hex values.

`prompts/process/00_05_frontend_design_toolchain.md` (Playwright,
Impeccable, Taste, `docs/frontend/config/DESIGN.md`) is the next phase —
it audits and refines this initial build; it does not replace it.

## Container

```bash
make ui-up          # bring up factory-ui alongside the rest of the stack
./scripts/ui-rebuild.sh   # rebuild from source and recreate the container
```

Published at `http://localhost:3000/`.
