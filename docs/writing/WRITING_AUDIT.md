# Writing Audit

Corpus: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
`docs/release-checklist.md`. Perspectives: Vale, no-ai-slop (detect mode),
manual read for the earned-caveat/accuracy trait. See
`docs/writing/BASELINE.md` for raw tool output.

## Findings

### F1 — `Vale.Spelling` false positives on project vocabulary

```text
Evidence:    README.md:1:3 'editors_factory', README.md:5:20 'scaffolded'
Source:      Vale.Spelling
Impact:      noise on every future Vale run against this file
Risk:        none. These are real project terms
Recommendation: add to docs/writing/config/styles/config/vocabularies/Factory/accept.txt
Decision:    FIXED. Added during this pass (see .vale.ini / vocab file)
Severity:    P2
```

### F2 — Vale scanning its own vendored style-package content

```text
Evidence:    docs/writing/config/styles/alex/README.md:1:11, flagged by
             Vale.Spelling for the word "alex" (the package's own name)
Source:      config-scope bug, discovered running the Phase 7 full audit
Impact:      false findings on third-party vendored content, not this
             project's documentation
Risk:        none. No project content involved
Recommendation: exclude docs/writing/config/styles/** from linting
Decision:    FIXED. Added [docs/writing/config/styles/**] BasedOnStyles=
             override to .vale.ini during this pass
Severity:    P2
```

### F3 — `write-good.E-Prime` flags ordinary technical passive voice

```text
Evidence:    README.md:5:16 "was scaffolded", CHANGELOG.md:3:42
             "be documented", CHANGELOG.md:5:12 "is based"
Source:      write-good.E-Prime
Impact:      E-Prime bans every form of "to be" outright, far too strict
             a linguistic discipline for this corpus's register.
             Confirmed against Arcanium's own identical finding and
             identical disable decision in its .vale.ini
Risk:        none of the three instances are genuine AI-writing tells
Recommendation: disable write-good.E-Prime
Decision:    FIXED. Disabled in .vale.ini with inline justification,
             this pass
Severity:    P2
```

### F4 — `alex.ProfanityUnlikely` false positive on "hook"

```text
Evidence:    CONTRIBUTING.md:26:18 "The pre-commit hook will block..."
Source:      alex.ProfanityUnlikely
Impact:      "hook" here is unambiguously a Git hook (the sentence names
             Gitleaks and pre-commit explicitly)
Risk:        none
Recommendation: disable alex.ProfanityUnlikely
Decision:    FIXED. Disabled in .vale.ini with inline justification,
             this pass
Severity:    P2
```

### F5 — `CHANGELOG.md` passive-voice boilerplate (unfixed, deliberately)

```text
Evidence:    CHANGELOG.md:3 "will be documented", CHANGELOG.md:5
             "is based on [Keep a Changelog] ... and this project
             adheres to [Semantic Versioning]"
Source:      write-good.Passive (still enabled: genuine passive voice,
             not an E-Prime false positive)
Impact:      minor. Recognizable, standard Keep a Changelog preamble
             text used verbatim across a huge number of open-source
             projects
Risk:        rewriting it into active voice would make this file look
             like a custom changelog format instead of the immediately
             recognizable standard one. Recognizability has more value
             here than an active-voice rule
Recommendation: leave as-is
Decision:    REJECTED (deliberately kept). Matches an external,
             widely-recognized convention verbatim; see STYLE.md
Severity:    P3
```

### F6 — `README.md`'s project description is stale, not a style issue

```text
Evidence:    README.md:3 "Automation scripts and utilities for
              shell-based workflows." This predates the project's actual
              purpose (see security/README.md, prompts/base_project/)
Source:      manual read, not flagged by either tool (neither Vale nor
             no-ai-slop check factual accuracy)
Impact:      a reader opening README.md first gets a materially wrong
             description of what this project is
Risk:        HIGH if left permanently, but this is a content fix, not a
             style fix. Replacing it is explicitly owned by
             prompts/base_project/01_01_factory_stack.md, deliverable 5
             ("replace the placeholder scaffold description with a real
             project description")
Recommendation: do not fix here; execute
             prompts/base_project/01_01_factory_stack.md next, which
             already scopes this exact change
Decision:    DEFERRED. Out of scope for a style pass; tracked, not lost
Severity:    P0 (content), explicitly not remediated by this prompt
```

## no-ai-slop detect-mode findings

Zero named patterns found across all four files. The corpus is plain,
unedited scaffold boilerplate with no AI-generated prose in it to
begin with, so an empty finding set here is an honest result, not a
skipped or trivial check.

## Summary

```text
P0: 1  (F6 — content accuracy, explicitly deferred to prompts/base_project/01_01)
P1: 0
P2: 4  (F1-F4 — all fixed this pass, tooling/vocabulary only)
P3: 1  (F5 — reviewed, deliberately kept)
P4: 0
```
