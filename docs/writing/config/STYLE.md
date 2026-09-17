# Documentation Style Contract

Derived while executing
`prompts/process/00_02_docs_style_toolchain.md`, 2026-09-17. Governs
every documentation edit made in this pass and in
`prompts/process/00_03_docs_quality_gate.md`.

## A note on how this was derived

Most documentation-style contracts extract a voice from an existing,
mature corpus. This project's shipped documentation corpus is currently
four short, unedited scaffold files (see `docs/writing/BASELINE.md`). No
accumulated voice exists yet to extract. This contract is written
instead as the standard the project's *real* documentation (landing with
`prompts/base_project/01_01_factory_stack.md` onward, and later component
READMEs) must meet, informed by:

- the technical register already established in `security/` and
  `prompts/` (precise, evidence-based, no marketing language). Those are
  process artifacts, not shipped docs, but their register is the best
  available signal for this project's intended voice;
- the sibling project `arcanium`'s own `docs/writing/config/STYLE.md`,
  which covers a directly comparable HashiCorp infrastructure/security
  project and reached conclusions worth reusing where they transfer.

When real user-facing documentation is written for this project, revisit
this file and tighten it against real evidence rather than treating it
as permanently fixed.

## Voice

Precise, technical, written for someone who will actually run the
commands. No marketing language, no unearned superlatives, no hype. When
this project's docs are at their best (matching the register already
used in `security/authority-model.md` and `security/threat-model.md`),
they state a fact, then say why it matters operationally, not the other
way around.

## Audience

Engineers building, operating, or evaluating The Factory demo: people who
will run `make up`, `make demo-bad`, and `make reset`, and who need to
trust that a described command, path, or behavior is exactly correct,
not approximately correct.

## Principles

- Precision over polish. A correct, slightly plain sentence beats a
  polished, imprecise one.
- A caveat earned by a real constraint (a Vault entitlement gap, a known
  Podman race, a TTL that matters) is not hedging. Keep it. Filler
  hedging ("it's worth noting that," "in general") is not earned. Cut it.
- Show the mechanism, not just the conclusion. Prefer "PostgreSQL rejects
  the statement because `factory-good-role` was never granted `DELETE`"
  over "the action is blocked for security reasons."
- Technical accuracy is never traded for a smoother sentence.
- Real numbers, names, and commands beat abstractions. This project's own
  design conversations already model this well ("250 rows deleted," not
  "significant data loss").

## Terminology

Keep these consistent across every file, derived from `security/` and
`prompts/`, which have already had to settle on one term each:

```text
"BAD profile" / "GOOD profile"     — not "bad mode"/"good mode" in prose
                                      headings, though "mode" is fine
                                      inline (both appear already; do not
                                      introduce a third synonym)
"delegation depth"                 — not "hop count" or "chain depth"
"effective authority"              — not "actual permissions"
"authority envelope"               — not "permission set" or "scope"
"credential lease" / "lease"       — not "token" (Vault's own leases are
                                      not the same thing as a bearer
                                      token; do not conflate them)
"make reset"                       — always this exact command form when
                                      referring to the reset flow in prose
```

## Formatting conventions

Observed already in `security/` and `prompts/` and worth carrying into
shipped docs:

- One H1 per file.
- Fenced code blocks tagged with a language where the content is a real
  command (`bash`) or an example structure (`text`). This corpus already
  uses `text` fences for illustrative, non-executable diagrams; keep that
  distinction rather than tagging everything `bash`.
- A caveat/gotcha gets its own short paragraph starting with the concrete
  fact, not a blockquote admonition. This project has not established a
  blockquote-warning convention yet; do not invent one prematurely.
- Tables for anything with more than two comparable rows of structured
  data (see `security/authority-model.md`'s authority matrices); prose
  for a single comparison.

## Anti-patterns (banned)

From the `no-ai-slop` skill's own named patterns
(`.agents/skills/no-ai-slop/SKILL.md`), the ones most relevant to this
project's technical/security register. Watch for these specifically once
real prose documentation is written:

- Importance puffery ("stands as a testament," "plays a vital role").
  This project's whole argument depends on concrete, checkable claims;
  puffery undermines exactly that credibility.
- Weasel attribution ("industry reports suggest"). Every claim in this
  project's docs should be traceable to a specific script, endpoint, or
  observed behavior.
- Fake-profound kickers and summary-recap endings. End a doc on the last
  concrete instruction or fact, not a restated theme.
- Binary contrasts and colon reveals as rhetorical flourishes. This
  corpus's real binary contrast (BAD vs. GOOD) is a genuine, load-bearing
  technical distinction, not a rhetorical device; do not dilute it by
  adding decorative ones elsewhere.

## What this project's documentation is NOT

- Not a marketing page. The project's own credibility argument (real
  damage, real containment, real audit trail) is undercut by hype
  language.
- Not written in the narrative/conversational style of `input/*.md` (the
  design-conversation transcripts). Those are process history; shipped
  documentation is reference material, not a retelling of how the design
  was reached.
- Not uniformly formal either. `security/README.md`'s tagline ("Break the
  factory. Learn from it. Reset. Repeat. No regrets.") is a deliberate,
  approved exception, not license to add more slogans
  elsewhere.
