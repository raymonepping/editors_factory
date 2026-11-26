# 01_06 — Glass theme: analysis and plan

Scope: `ui/app/**`, `ui/package.json` (+ lockfile), one meta tag in
`ui/nuxt.config.ts`. `backend/`, `agents/`, `ui/server/` (BFF gateway / OIDC
relay), compose and terraform are untouched.

Supersedes the *visual* direction of `prompts/frontend/01_00_factory_design_spec.md`
(dark steel + gold). 01_00's structural rules (semantic tokens only,
reduced-motion, state never by colour alone, focus visibility) stay in force.

## 1. What "the glass look" is

One design system, copied across the sibling projects. Canonical write-up:
`arcanium/docs/frontend/config/DESIGN.md`. Canonical Nuxt CSS:
`arcanium/arcanium/ui/app/assets/css/main.css`, `project_durin/ui/.../main.css`.

- `vault-glass.css` is byte-identical (same md5) in 8 Vite projects
  (vault_balancing, codex, dance, governor, identity, pipeline, sync,
  ultimate). Durin / Arcanium / lab_index / golden_ticket / red_doors /
  red_pass / shift_gear carry the Nuxt flavour. `multi_pass` is a lighter variant.
- Arcanium's DESIGN.md already names Editors Factory as part of this family.
  This repo was still dark steel + gold, so this is a catch-up.

Recipe, most important first:

1. **Ground.** `body` paints "the building behind the glass": three soft
   daylight radials + 1px aluminium mullions every 180px, fixed. Glass only
   reads as glass because there is something to blur.
2. **One pane recipe everywhere.** `rgba(255,255,255,.58)` +
   `backdrop-filter: blur(22px) saturate(150%)` + hairline ink border + soft
   long shadow + inset white top highlight. No per-page variants.
3. **Ink for primary action.** Primary buttons are solid `#0f1a2a`; secondary
   is white glass; blue is for identity/links/focus/approve.
4. **Ink island.** At most one dark pane per page; it re-scopes text/state
   tokens so content inside inverts for free.
5. **Strong, AA-safe semantic hues** (blue / amber / green / red). Tints via
   `color-mix()` from a `--hue-*` token, never hardcoded `rgba()`.
6. **Type.** Hanken Grotesk Variable + JetBrains Mono Variable, self-hosted.
7. **Shape.** 12px panes/controls, 16px large surfaces, pills 100px. Floating
   sticky glass topbar; frosted rail whose active item is a raised white chip.
8. Motion limited to state changes; reduced-motion honoured globally.

## 2. This project before the change

Helped:

- `main.css` was already a semantic-token contract; components reference those
  names ~330 times. Changing token values flips most of the UI.
- Same stack as Durin/Arcanium (Nuxt 4 + Tailwind 4). Only two new deps (fonts).

Fought (measured; contrast vs light glass `#f6f8fa`):

| Finding | Consequence |
|---|---|
| gold-400 1.68, text-secondary 2.03, text-muted 2.64, warning 3.23, healthy 3.26, neutral 4.33 | Every meaning-bearing colour replaced with the AA set. |
| 13 direct `--factory-*` uses bypassing semantic tokens | Re-pointed to semantic tokens. |
| ~10 raw colour literals in keyframes / scrims | `color-mix()` of hue tokens. |
| `login.vue` fully hardcoded dark + `text-neutral-*` | Rewritten. |
| `var(--color-bg-page)` undefined (PendingApprovals.vue) | Fixed. |
| 3px coloured left rails (sidebar active, timeline newest row) | Raised chip / row wash. |
| `.factory-atmosphere` + skyline SVG, `color-scheme: dark` (CSS + meta) | Replaced / flipped. |
| `Inter` / `IBM Plex` named but never loaded | Self-hosted fonts are a net fix. |
| Component CSS unlayered, Tailwind utilities layered | Do NOT move primitives into `@layer components`. |
| Tailwind imported without preflight | Keep; add only a `box-sizing` reset. |

## 3. Decisions

1. Replace dark; no toggle (same call Arcanium made, 2026-10-06).
2. Keep semantic token names, change values (smallest diff).
3. Gold's meaning ("live work") survives as amber; primary buttons -> ink;
   focus/links/selected -> blue.
4. Ink island = the Human Request panel on Overview.
5. Keep state-bearing animations (alarm pulse, station breathe, connector
   spark, DAG running pulse); recolour only.
6. No nested glass: inner panels use a flat `--well` fill.

## 4. Token mapping

| Token | Old (dark) | New (glass) |
|---|---|---|
| `--color-bg-canvas` | `#100d0a` | `#e9eef3` + body daylight gradient |
| `--color-bg-shell` | `#17130a` | `rgba(255,255,255,.72)` |
| `--color-bg-panel` | `#221e22` | `rgba(255,255,255,.58)` |
| `--color-bg-panel-raised` | `#2f292d` | `rgba(255,255,255,.80)` |
| `--color-bg-panel-info` | `#252634` | blue 8% mix |
| `--color-bg-panel-warning` | `#592d28` | orange 10% mix |
| `--color-text-primary` | `#f3f0ea` | `#0f1a2a` (16.4:1) |
| `--color-text-secondary` | `#b8afa8` | `#2f3d50` (10.4:1) |
| `--color-text-muted` | `#a09994` | `#475569` (7.1:1) |
| `--color-text-on-gold` | `#17130a` | `#ffffff` (on ink buttons; name kept) |
| `--color-border-subtle` | `#3d3743` | `rgba(15,26,42,.10)` |
| `--color-border-strong` | `#5e5b69` | `rgba(15,26,42,.20)` |
| `--color-border-info` / `-active` | blue-500 / gold-400 | `#0369a1` |
| `--color-accent-primary` | gold-400 | `#025a8c` |
| `--color-accent-active` | gold-300 | `#0369a1` |
| `--color-accent-hot` | orange-400 | `#b93d0b` |
| `--color-state-healthy` | `#6f9278` | `#0f652b` (6.8:1) |
| `--color-state-contained` | `#716a8b` | `#4f5bd5` (5.2:1) |
| `--color-state-warning` | `#d96b36` | `#b93d0b` (5.3:1) |
| `--color-state-critical` | `#c4473d` | `#b01818` (6.6:1) |
| `--color-state-neutral` | `#777381` | `#56657a` (5.6:1) |
| radius panel / control | 8 / 6 | 12 / 9 |
| `color-scheme` | dark | light |

New: `--hue-*`, `--well`, `--hover`, `--scrim`, `--ink`, `--ink-hover`,
`--glass-border`, `--glass-hi`, `--ease-out`, `.ink-island` scope.
Retire: `--factory-*` raw palette and `--factory-skyline-svg` once unreferenced.

## 5. Phases

0. **Baseline.** `git status`; baseline `npm run build`; before-screenshots when
   the stack is up (needs Keycloak login).
1. **Foundation.** Font packages (+ lockfile; Containerfile runs `npm ci`),
   main.css tokens + primitives + body ground, `app.vue`, `color-scheme` meta.
2. **Shell.** `dashboard.vue` floating glass topbar; `AppSidebar.vue` frosted
   rail + raised chip; `FactoryFooter.vue` hairline + non-white shine.
3. **Components.** PanelShell, AgentChain, DagVisualizer, NodeAttemptDrawer,
   ProfileSwitch, EventTimeline, PendingApprovals, pages/dag.vue,
   HumanRequest (ink island).
4. **Login.** Glass card, ink button, well for demo accounts.
5. **Verify + record.** Build, scripted contrast check, grep for leftover dark
   literals, `make ui-build` for the container, decision 17 in
   `.claude/DESIGN.md`, 01_00 marked superseded.

## 6. Risks

- Contrast regressions (mitigated by Arcanium's pre-verified values).
- Blur cost against a live SSE-driven dashboard (no nested glass; lower blur
  on large panes / `contain: paint` if it janks).
- Dark assumptions invisible to grep (inline `style=`, SVG attrs): visual pass.
- Brand drift: skyline intentionally dropped; warm "live work" colour kept.
- Concurrent sessions: `git status` at the start of each phase.

## 7. Out of scope

Backend, agents, BFF `server/`, API/SSE shapes, routes, copy, dark toggle,
command palette / sidebar collapse / skip-link, re-recording README/article
screenshots (dark-era).
