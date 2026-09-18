# Baseline: 2026-09-18_post-sticky-footer

## Generic summary (from manifest.yaml)

- Purpose: Small follow-up per direct user request: FactoryFooter.vue is now position:fixed to the viewport bottom (always visible, even scrolled to the top of a page taller than the viewport) instead of sitting at the natural end of scrollable content. position:sticky was considered and rejected in a code comment — sticky only pins an element once its own natural position would otherwise scroll past, it cannot pull an already-off-screen footer into view early, which is exactly what always-visible requires; fixed is the correct tool. Fixed elements are removed from normal flow, so ui/app/pages/index.vue's .dashboard-grid reserves matching space via padding-bottom: calc(var(--footer-height) + 24px) — --footer-height is measured live by a ResizeObserver in FactoryFooter.vue itself (onMounted + observe), not a guessed constant, specifically because the footer's own rendered height changes at the mobile breakpoint (the signature row stacks to two lines there). Validated for real against the actual rebuilt container (scripts/ui-rebuild.sh): typecheck and build clean, then live Playwright checks at 1920x1080, 1280x800, and 390x844 — confirmed at every size that (1) the footer is visible immediately on page load without scrolling, (2) it stays pinned to the viewport bottom while scrolling through content above it, and (3) scrolling all the way to the true end of the document (the Event Timeline panel, the last element) shows it fully clear of the footer with clean spacing, not clipped or overlapped, at every tested viewport including mobile where the footer is tallest.
- Captured at: 2026-09-18T06:20:23Z (UTC)
- Source commit: `89bc5cd62e935ef47a679e77a1561837b1847a16` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-18_post-dashboard-redesign
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
