# Writing Improvement Plan

Derived from `docs/writing/WRITING_AUDIT.md`.

## Wave 1 — clear "reads like it was generated" patterns

None found. No-ai-slop detect mode returned zero patterns across the
full corpus (`docs/writing/BASELINE.md`). No Wave 1 work exists.

## Wave 2 — terminology and formatting consistency

Not yet applicable. The corpus is four short boilerplate files with no
terminology to reconcile. The terminology list in
`docs/writing/config/STYLE.md` is written pre-emptively, for the real
documentation that lands with `prompts/base_project/01_01_factory_stack.md`
onward. Enforce it starting then, via
`prompts/process/00_03_docs_quality_gate.md`.

## Wave 3 — remaining tool findings

All four real, actionable Vale findings (F1–F4 in `WRITING_AUDIT.md`)
were fixed directly while establishing the toolchain itself (vocabulary
additions and two evidenced rule disables). Fixing false positives is a
precondition for a usable baseline, not deferred prose work. Nothing
remains in this wave.

## Wave 4 — optional refinement

Not started, per this prompt's own instruction not to start Wave 4
merely because it exists, and because there is no Wave 1–3 backlog
justifying it yet.

## Explicitly not actioned by this plan

`README.md`'s stale project description (F6 in `WRITING_AUDIT.md`) is a
content-accuracy fix, not a style/prose-quality fix, and is already
scoped to `prompts/base_project/01_01_factory_stack.md` (deliverable 5).
Fixing it here would duplicate that prompt's own deliverable and risk the
two diverging.

## Net effect of this pass

This pass's real output is the toolchain itself (Vale + no-ai-slop,
configured and evidenced) and `docs/writing/config/STYLE.md`, the
contract the project's actual documentation will be held to once it
exists. There was no meaningful prose to improve yet. Re-run
`prompts/process/00_02_docs_style_toolchain.md` (or at minimum this
plan's Phase 7/8) once `prompts/base_project/01_01_factory_stack.md` and
later prompts have produced real README/component documentation.
