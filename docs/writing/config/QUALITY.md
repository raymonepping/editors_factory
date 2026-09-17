# Documentation Quality Gate Policy

Durable policy for `prompts/process/00_03_docs_quality_gate.md`. Created
on first run, 2026-09-17, against `docs/writing/config/STYLE.md` as it
stood at that time. Update only when the corpus's real requirements
change, not to make a failing run pass.

## Required gates

```text
GATE 1   Structural integrity            REQUIRED, blocking
GATE 2   Link and reference integrity    REQUIRED, blocking
GATE 3   Vale compliance                 REQUIRED, blocking on errors only
                                          (Vale "warning"/"suggestion"
                                          severity is advisory — this
                                          corpus's precise, technical
                                          register triggers write-good's
                                          passive-voice opinion often and
                                          legitimately; see STYLE.md)
GATE 4   AI-writing-pattern audit        REQUIRED, blocking only on a
                                          named pattern actually present
                                          in user-facing prose (P0/P1-
                                          equivalent)
GATE 5   Technical accuracy spot-check   REQUIRED, blocking
GATE 6   STYLE.md compliance             REQUIRED, non-blocking
GATE 7   Terminology/formatting          REQUIRED, non-blocking
         consistency
GATE 8   Readability                     REQUIRED, non-blocking
                                          (no automated tool configured;
                                          manual judgment against
                                          STYLE.md's "portability test")
```

## Optional gates

```text
GATE 9   Freshness                       NOT required — this project has
                                          no meaningful "staleness" signal
                                          yet (no deploy/release history)
GATE 10  Cross-reference completeness    NOT required yet — most
                                          features described in
                                          prompts/ do not exist as real,
                                          documented components yet
```

## Scope note (revisit when it stops being true)

The corpus this gate evaluates is currently just `README.md`, four
original scaffold files, and this toolchain's own generated reports under
`docs/writing/`. `prompts/` and `security/` are explicitly out of scope —
process/design artifacts, not shipped documentation — by the same
convention `prompts/process/00_02_docs_style_toolchain.md` established,
even though (unlike `arcanium`) `prompts/` is not git-ignored in this
repository. Revisit this scope note once
`prompts/base_project/01_01_factory_stack.md` and later prompts produce
real component READMEs — the corpus will grow substantially and Gates
7/9/10 will start to matter in practice.

## Vale configuration this policy assumes

```text
.vale.ini at repo root
StylesPath = docs/writing/config/styles
Packages = write-good, alex
Disabled: write-good.E-Prime, alex.ProfanityUnlikely, alex.Ablist
  (each with inline justification in .vale.ini — see
  docs/writing/WRITING_AUDIT.md for the evidence behind the first two,
  and docs/writing/DOCS_QUALITY_GATE.md for the third)
```

## Viewport/browser matrix, performance targets

Not applicable — this is documentation, not a rendered application.
