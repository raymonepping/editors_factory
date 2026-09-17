# Documentation Writing Baseline

Captured while executing
`prompts/process/00_02_docs_style_toolchain.md`, 2026-09-17.

## Files inventoried

Shipped/user-facing documentation corpus (excludes `prompts/`, which is
process/build instructions, not shipped documentation. See
`prompts/process/00_02_docs_style_toolchain.md` §1 and the note in
`DOCS_TOOLCHAIN_REPORT.md` about this project's `prompts/` not being
git-ignored the way Arcanium's was):

```text
README.md
CHANGELOG.md
CONTRIBUTING.md
docs/release-checklist.md
```

4 files. `docs/writing/` itself (this toolchain's own output) and
`sanity_check.md` (a generated ignore-file validation report, not
authored documentation) are excluded from the corpus being audited.

## Existing style tooling

```text
PRESENT / NOT PRESENT: NOT PRESENT
```

No `.vale.ini`, no `.markdownlint.json`, no spell-checker or link-checker
config existed before this prompt ran.

## Existing voice

This is not an established product's documentation corpus with a real,
accumulated voice to preserve. It is `generate_project.sh` scaffold
boilerplate, largely unedited since project creation. `README.md` still
describes the project as "Automation scripts and utilities for
shell-based workflows," which predates the actual project purpose
defined in `security/README.md` and `prompts/base_project/`.
`CHANGELOG.md` and `CONTRIBUTING.md` are unmodified Keep a Changelog /
Conventional Commits boilerplate. `docs/release-checklist.md` is a plain
generated checklist.

In other words, no distinctive "hard-won" voice yet exists to protect
from an overzealous style pass. The opposite risk applies here: so
little real content exists that `STYLE.md` (Phase 6) has to be written as a
forward-looking contract for documentation this project has not written
yet (the real user-facing docs will land with
`prompts/base_project/01_01_factory_stack.md` onward), not purely
extracted from existing prose. This is recorded explicitly rather than
inventing a voice that does not exist.

## Baseline tool run (raw counts, before any fix)

Vale, initial run (before disabling any rule):

```text
3 errors, 4 warnings, 3 suggestions in 6 files
```

- 2 `Vale.Spelling` errors: `editors_factory`, `scaffolded` (both
  legitimate project vocabulary, not misspellings).
- 1 `Vale.Spelling` error: a false hit inside the synced `alex` style
  package's own vendored `README.md` (a config-scope bug, fixed by
  excluding `docs/writing/config/styles/**` from linting. See
  `.vale.ini`).
- 2 `write-good.E-Prime` suggestions and 2 `write-good.Passive` warnings
  on ordinary technical passive constructions ("was scaffolded", "is
  based on ... and this project adheres to ...").
- 1 `alex.ProfanityUnlikely` warning on "hook" (a Git hook, per
  `CONTRIBUTING.md`'s own security section).

no-ai-slop, detect mode, full corpus (4 files): **0 named patterns
found.** The corpus is plain boilerplate with no AI-generated prose to
begin with. An honest "nothing to detect" result, not a skipped check.
