# Baseline: 2026-09-18_post-records-panel

## Generic summary (from manifest.yaml)

- Purpose: Two more direct user requests on the dashboard: (1) footer's Signal Key legend is now collapsed by default with a toggle button (FactoryFooter.vue), reclaiming vertical space on the now-permanently-visible fixed footer — the existing ResizeObserver-driven --footer-height measurement already picks up the height change when it opens, no extra plumbing needed. localStorage-persisted like PanelShell's own panels. (2) New 'Recent records' panel (ui/app/components/FactoryRecords.vue) positioned above the Factory State/Agent Chain row, full width: shows the 5 most recent orders (id, customer, status, updated time) with real prev/next pagination, unfolded by default, live-refreshing only while on page 1 when a database_changes SSE event arrives (paging back to browse older records is never yanked out from under the viewer). New public backend endpoint GET /api/factory-records?limit=&offset= (backend/src/routes/factoryRecords.js) — same public/unauthenticated pattern as factoryState.js and events.js, real SQL pagination (LIMIT/OFFSET + a COUNT(*) for total), verified directly against two different pages returning genuinely different rows.

Found and fixed a real bug while building this: PanelShell.vue's header has its own click-to-collapse handler on the whole header row; the #actions slot (used here for the pager buttons) had no propagation guard, so clicking Next/Prev also bubbled up and toggled the panel closed — confirmed live via Playwright (the panel visibly collapsed on the first pagination click in the first test pass). Fixed with a single @click.stop wrapper around the actions slot container; re-verified the panel now stays open through repeated pagination clicks.

Validated for real against the actual rebuilt container (scripts/ui-rebuild.sh): typecheck and build clean, then live Playwright checks — confirmed pagination shows genuinely different order rows per page (not the same 5 repeated), the panel does not collapse on interaction, the footer legend toggles open/closed correctly with the chevron rotating, and zero console errors throughout.
- Captured at: 2026-09-18T06:36:50Z (UTC)
- Source commit: `58e06567209d0c3175fcb89f2419d15051830a78` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-18_post-sticky-footer
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
