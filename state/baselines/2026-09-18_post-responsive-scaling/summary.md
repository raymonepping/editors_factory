# Baseline: 2026-09-18_post-responsive-scaling

## Generic summary (from manifest.yaml)

- Purpose: Direct user request with a screenshot showing the dashboard as a small centered island on a large display. Measured the actual problem first with Playwright (not guessed): the shell was hard-capped at max-width:1400px regardless of viewport, confirmed empirically at 1920/2560/3440/3840px widths — wasted space per side ranged from 240px (1920) up to 1200px (3840), a flat width no matter how large the display. Fixed by replacing the fixed cap with a shared --dashboard-max-width: clamp(1400px, 88vw, 2960px) custom property (assets/css/main.css), referenced by both pages/index.vue's .dashboard and FactoryFooter.vue's .factory-footer (previously two independent max-width:1400px rules that would have drifted out of sync under any future edit) — chosen to scale with the actual viewport ('enlarge', not just 'doesn't overflow') while a 2960px ceiling keeps ultra-wide/4K displays from stretching panels into unreadably long line lengths or absurd internal whitespace. Also made --gap-panel/--pad-panel/--pad-dense, the dashboard title, and FactoryMetric's compact value font-size fluid via clamp() so panels feel genuinely bigger on large displays, not just wider with more empty padding.

Re-measured with Playwright at the same four sizes after the fix: 1920->1730px (was 1440), 2560->2293px, 3440->3000px, 3840->3000px — wasted space per side cut by 60-73% at every size tested. Verified visually via screenshots at all four sizes plus laptop (1280x800) and mobile (390x844) to confirm small viewports still shrink correctly (no regression) and large viewports now visibly use the available space without becoming absurd. One real finding during this pass, not a code bug: a Playwright  screenshot of the laptop viewport showed the position:fixed footer appearing to float mid-page — diagnosed as a known fullPage-screenshot-vs-fixed-element stitching artifact (Playwright's fullPage capture scrolls and composites multiple frames; a fixed element gets frozen in its per-frame viewport position across the composite) by re-capturing the same viewport WITHOUT fullPage and confirming the footer renders and stays correctly pinned during real scrolling — not a regression, a testing-methodology footgun worth remembering for any future fixed-element screenshot work on this project.

Did not add a sidebar — the user explicitly offered this as an option if the page felt too crowded, but the width/scaling fix directly addresses the reported complaint (wasted space, not literal panel count) without the larger structural change, so it was left as a future option rather than applied preemptively.
- Captured at: 2026-09-18T06:43:30Z (UTC)
- Source commit: `d5e392640502f9083d5ec9a54a977da166b6de19` on branch `main`
- Working tree dirty: true
- Previous baseline: 2026-09-18_post-records-panel
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
