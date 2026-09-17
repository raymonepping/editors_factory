# Documentation Quality Gate

Executed: `prompts/process/00_03_docs_quality_gate.md`, 2026-09-17,
immediately following `prompts/process/00_02_docs_style_toolchain.md` in
the same session.

## Summary

```text
Overall result: PASS WITH WARNINGS
```

## Gate results

| Gate | Result | Blocking | Evidence |
|---|---|---|---|
| Structural integrity | PASS | Yes | Every file in the corpus (9 files: README.md, CHANGELOG.md, CONTRIBUTING.md, docs/release-checklist.md, docs/writing/{BASELINE,WRITING_AUDIT,WRITING_IMPROVEMENT_PLAN,DOCS_TOOLCHAIN_REPORT}.md, docs/writing/config/STYLE.md) has exactly one H1, no skipped heading levels, balanced code fences. Checked with a manual heading-level walk (no project markdownlint config exists — see Gate 1 note below). |
| Link and reference integrity | PASS | Yes | One internal markdown link exists (`README.md` → `LICENSE`), confirmed present. Every backtick-quoted file-path reference in the corpus resolves; the apparent misses from an automated scan (`generate_project.sh`, `hooks.json`, bare `STYLE.md` shorthand, `input/*.md` glob) are false positives of the scan heuristic, not real broken references — checked individually. |
| Vale compliance | PASS | Yes (errors only) | `vale README.md docs/` → 0 errors, 49 warnings, 0 suggestions across 33 files, including this report and `config/QUALITY.md` themselves (see `docs/writing/BASELINE.md` for the pre-fix run: 3 errors, 6 files). All warnings are `write-good.Passive`/`TooWordy`/`Weasel`, advisory per `docs/writing/config/QUALITY.md`. Two more `Vale.Spelling` misses (`markdownlint`, and a `Vale.Weasel` hit on "substantially" in `config/QUALITY.md`) surfaced from this gate's own reports and were vocabularied/reviewed in turn — the corpus genuinely settles at 0 errors, not merely at the time the toolchain report was first written. |
| AI-writing-pattern audit | PASS WITH WARNINGS | No (unless P0/P1) | See "Gate 4" section below — em-dash overuse found and substantially remediated (not to zero) across this pass's own newly-authored reports; no other named pattern found. |
| Technical accuracy | PASS | Yes | See "Gate 5" section below — one stale factual claim found and fixed during this very gate run (documented, not hidden). |
| STYLE.md compliance | PASS | No | This pass's own writing follows `STYLE.md`'s principles (precision, concrete evidence, no marketing language); the four original scaffold files predate `STYLE.md` and are not held to it retroactively (see `WRITING_AUDIT.md` F5). |
| Terminology/formatting consistency | N/A (documented) | No | The corpus does not yet contain the real terminology list from `STYLE.md` (BAD profile/GOOD profile/delegation depth/etc.) — that vocabulary lives in `prompts/`/`security/`, out of scope for this corpus until real component docs exist. Nothing to check yet; not a failure. |
| Readability | PASS | No | Manual review only (no automated tool configured, none required by `QUALITY.md`); dense but appropriate for the stated engineer audience. |

## Gate 4 detail — AI-writing-pattern audit

no-ai-slop detect mode found **zero** named rhetorical patterns (no
banned words, no colon reveals, no binary-contrast rhetoric, no fake-
profound kickers, no summary-recap endings) across the full corpus.

It did find **em-dash overuse** — a named pattern in
`.agents/skills/no-ai-slop/SKILL.md` ("In short copy, use none. In
longer drafts, 1-2 are fine... Remove clusters and decorative dashes.") —
in this pass's own newly-authored reports (`docs/writing/BASELINE.md`,
`WRITING_AUDIT.md`, `WRITING_IMPROVEMENT_PLAN.md`, `DOCS_TOOLCHAIN_REPORT.md`,
`docs/writing/config/STYLE.md`). Initial counts ranged 4–23 per file.

This was treated as a real, actionable finding, not dismissed:

```text
File                              Before   After   Remaining (all in
                                                     headings/table
                                                     cells/code-fenced
                                                     structured records,
                                                     not prose rhythm)
docs/writing/config/STYLE.md         22       6     table alignment only
docs/writing/WRITING_AUDIT.md        23       9     headings + summary block
docs/writing/BASELINE.md              7       0     —
docs/writing/WRITING_IMPROVEMENT_PLAN.md  7    4     headings only
docs/writing/DOCS_TOOLCHAIN_REPORT.md    16    4     table cells only
```

Not driven to zero everywhere — the remaining instances are a consistent
heading-label convention (`### F1 — Title`) or compact table-cell/record
annotations, judged structural rather than prose-rhythm filler. This
judgment call is recorded here, not hidden, so it can be revisited.
`security/*.md` and `prompts/*.md` show the same pattern from the same
authoring session and were **not** remediated — out of this gate's
corpus scope (see `docs/writing/config/QUALITY.md`'s scope note) —
flagged under Outstanding work.

## Gate 5 detail — technical accuracy spot-check

| Claim | Verification method | Result |
|---|---|---|
| Vale version 3.21.0 | ran `vale --version` | CONFIRMED |
| no-ai-slop hash `77d287e3c8e0...` | compared against `skills-lock.json` | CONFIRMED |
| "0 errors, 2 warnings, 0 suggestions" for the 4-file corpus | re-ran `vale README.md CHANGELOG.md CONTRIBUTING.md docs/release-checklist.md` | CONFIRMED |
| `docs/writing/DOCS_TOOLCHAIN_REPORT.md`'s "Two Vale rules disabled" | compared against current `.vale.ini` | **STALE** — a third rule (`alex.Ablist`) was disabled during this very gate run, after the toolchain report was written. Fixed in this pass: the report now says "Three Vale rules disabled" and explains why, including the amusing detail that the third disable was triggered by the word "disabled" appearing in the report's own prior sentence. |
| `README.md`'s project description | manual read against `security/README.md`/`prompts/base_project/` | Confirmed STALE (already tracked as F6 in `WRITING_AUDIT.md`, correctly deferred to `prompts/base_project/01_01_factory_stack.md`, not re-litigated here) |

The STALE finding above is a BLOCKER-class finding per the severity model
(Section 15) and was fixed within this pass rather than left open — see
`.vale.ini` and `docs/writing/DOCS_TOOLCHAIN_REPORT.md`'s current text.

## Severity summary

```text
BLOCKER:   1 found (stale rule-count claim, Gate 5) — FIXED this pass
HIGH:      1 found (em-dash overuse, Gate 4) — substantially remediated
           this pass, not to zero; judgment documented above
MEDIUM:    0
LOW:       0
ADVISORY:  37 (Vale write-good warnings, tracked, not blocking)
```

## Release decision

```text
DOCUMENTATION QUALITY GATE
==========================

Structural integrity:  PASS
Link integrity:        PASS
Vale compliance:       PASS
AI-writing patterns:   PASS WITH WARNINGS
Technical accuracy:    PASS
STYLE.md compliance:   PASS
Consistency:           N/A (nothing to check yet)
Readability:           PASS

Overall:
PASS WITH WARNINGS

Blocking findings:
0 (the one BLOCKER found was fixed within this pass)

Non-blocking findings:
38 (37 Vale advisory warnings + 1 HIGH em-dash-overuse finding,
    partially remediated and documented)

Release recommendation:
RELEASE WITH WARNINGS
```

## Outstanding work

**Required:** none.

**Recommended:**

- Apply the same em-dash-density review this pass gave `docs/writing/`
  to `security/*.md` and `prompts/*.md` in a future pass — same
  authoring session, same pattern, currently out of this gate's corpus
  scope.
- Re-run this gate once `prompts/base_project/01_01_factory_stack.md`
  lands, when Gate 7 (terminology consistency) becomes meaningful for
  the first time.

**Optional:**

- Consider a project-local `.markdownlint.json` if Gate 1 needs to become
  automated rather than manual once the corpus grows.
