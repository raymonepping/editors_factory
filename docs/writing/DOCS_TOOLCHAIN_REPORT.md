# Docs Toolchain Report

Executed: `prompts/process/00_02_docs_style_toolchain.md`, 2026-09-17.

## Tooling installed

| Tool | Version | Install method | Config location |
|---|---|---|---|
| Vale | 3.21.0 | already present on this machine (Homebrew) — verified via `vale --version`, not reinstalled | `.vale.ini` (repo root), styles synced to `docs/writing/config/styles/` via `vale sync` |
| write-good (Vale package) | synced via `vale sync` | `Packages = write-good, alex` in `.vale.ini` | `docs/writing/config/styles/write-good/` |
| alex (Vale package) | synced via `vale sync` | same | `docs/writing/config/styles/alex/` |
| no-ai-slop | commit `77d287e3c8e0...` (matches `arcanium`'s own recorded install exactly — same upstream source, unmodified) | `npx skills add petergyang/no-ai-slop` | `.agents/skills/no-ai-slop/`, symlinked at `.claude/skills/no-ai-slop` |

Custom vocabulary: `docs/writing/config/styles/config/vocabularies/Factory/accept.txt`,
project terms (Podman, Vault, Ollama, agent-a..d, factory-bad-role,
factory-good-role, etc.) plus two corpus-specific additions
(`editors_factory`, `scaffolded`/`scaffolding`).

<!-- vale Vale.Terms = NO -->
Vale's Style Hub ([vale.sh/hub](https://vale.sh/hub)) consultation: `write-good` and `alex`
<!-- vale Vale.Terms = YES -->
were chosen without re-browsing the full Hub from scratch. They are the
same pair already evaluated and selected for `arcanium`, a sibling
HashiCorp infrastructure/security project with a directly comparable
technical register (see that project's own `.vale.ini`). Reusing an
already-evidenced decision for the same register is preferred here over
re-deriving it; if this project's real documentation later reveals a
different register than assumed, revisit the Hub properly rather than
carrying this assumption forward indefinitely.

Three Vale rules disabled, each with inline justification in `.vale.ini`.
The first two correspond to findings F3/F4 in `WRITING_AUDIT.md`; the
third (`alex.Ablist`) was found and fixed during the Gate 3 Vale run in
`prompts/process/00_03_docs_quality_gate.md`, against this report's own
prose ("Two Vale rules disabled..." — "disabled" flagged as a possible
reference to a person, a false positive for a config-state word, the
same class arcanium already documented for the identical word):

```text
write-good.E-Prime    = NO
alex.ProfanityUnlikely = NO
alex.Ablist            = NO
```

No hooks were registered by the no-ai-slop installer (verified: no
`hooks.json` or equivalent was created). Nothing required trust-sensitive
approval.

## Agent support

| Agent | Vale | no-ai-slop |
|---|---|---|
| Claude Code | CLI only (no native Vale integration exists upstream) | Native — installed via the `skills` mechanism, symlinked at `.claude/skills/no-ai-slop` |
| Codex | CLI only | Universal install path covers Codex per the installer's own summary output |
| IBM Bob | CLI only | Installer reported "skipped: IBM Bob — project directory not found" — no Bob-specific project directory exists in this repo; the skill content itself remains usable via its file path if Bob is introduced later |

## Existing corpus discovered

Four files: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
`docs/release-checklist.md`, unmodified `generate_project.sh` scaffold
boilerplate with no established voice yet. Full detail in
`docs/writing/BASELINE.md`.

One scoping note for future reuse of this prompt: `arcanium`'s version of
this prompt (which this project's copy derives from) assumes `prompts/`
is git-ignored and therefore out of the shipped-documentation corpus.
In `editors_factory`, `prompts/` is **not** git-ignored (confirmed via
`.gitignore`). It is tracked, but still correctly treated as
process/build instructions rather than shipped product documentation, by
convention rather than by ignore-status. The corpus scope in this report
reflects that.

## Baseline

See `docs/writing/BASELINE.md`. Initial Vale run: 3 errors, 4 warnings, 3
suggestions across 6 files (2 of the 6 being a config-scope artifact:
Vale linting its own synced style-package README). no-ai-slop detect
mode: 0 patterns found across the real 4-file corpus.

## Style contract

`docs/writing/config/STYLE.md`, written as a forward-looking contract
given the corpus's current thinness (see the file's own opening note),
informed by `security/`'s and `prompts/`'s existing technical register
and by `arcanium`'s comparable, more mature `STYLE.md`.

## Findings

See `docs/writing/WRITING_AUDIT.md`. 1 P0 (content, deferred, not a
style finding), 4 P2 (all fixed), 1 P3 (reviewed, deliberately kept).

## Changes applied

```text
.vale.ini                                          created
docs/writing/config/styles/config/vocabularies/
  Factory/accept.txt                               created
docs/writing/config/STYLE.md                        created
.agents/skills/no-ai-slop/                          installed
.claude/skills/no-ai-slop                            symlinked
skills-lock.json                                     created
docs/writing/BASELINE.md                             created
docs/writing/WRITING_AUDIT.md                        created
docs/writing/WRITING_IMPROVEMENT_PLAN.md             created
```

No content file (`README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
`docs/release-checklist.md`) was edited. Every real finding was either a
tooling/config fix (vocabulary, rule tuning) or explicitly deferred/
rejected with a documented reason.

## Changes deliberately rejected

- F5 (`CHANGELOG.md` passive-voice preamble): kept as-is; it matches the
  external Keep a Changelog convention verbatim, and recognizability
  outweighs the active-voice rule here.

## Changes deliberately deferred (not this prompt's scope)

- F6 (`README.md`'s stale project description): a content-accuracy fix
  already scoped to `prompts/base_project/01_01_factory_stack.md`
  deliverable 5. Fixing it here would duplicate that prompt's own
  deliverable.

## Validation

Before/after Vale run against the real 4-file corpus:

```text
BEFORE   3 errors, 4 warnings, 3 suggestions (6 files scanned, including
         a false-positive scan of Vale's own vendored style package)
AFTER    0 errors, 2 warnings, 0 suggestions (4 files scanned, corpus-
         only)
```

The 2 remaining warnings are F5, deliberately kept. No technical fact,
path, command, or warning was altered anywhere in the corpus. No
content file was edited at all during this pass.

## Outstanding work

**Required:**

- None for this pass's own scope.

**Recommended:**

- Execute `prompts/base_project/01_01_factory_stack.md` next (already
  planned), which will replace `README.md`'s stale description (F6) as
  part of its own deliverables.
- Re-run this prompt (or at minimum Phases 7–10) once real component
  documentation exists, so `STYLE.md`'s terminology/voice sections can be
  tightened against real evidence instead of the forward-looking
  reasoning used here.

**Optional:**

- Consider whether `docs/release-checklist.md` needs updating once
  `prompts/base_project/01_01_factory_stack.md`'s Makefile targets exist,
  since its `commit_gh --release` step assumes a release workflow that
  has not been exercised for this project yet, out of scope for a style
  pass, noted for later.
