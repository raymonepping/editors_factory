# Documentation style contract

This contract governs the root `README.md` and Markdown under `docs/`. It was refreshed on 2026-09-18 after the operator documentation was completed.

## Voice

Write precise technical prose for someone who will run the commands. State the observable fact, then its operational consequence. Avoid marketing language, vague claims, and decorative conclusions.

Preserve a found-live caveat when it prevents a real failure. Name the component, condition, and remedy. Do not soften a confirmed defect into a generic warning.

## Audience

The primary reader is an engineer operating, reviewing, or demonstrating The Factory on a local workstation. Assume familiarity with shells, containers, HTTP, and infrastructure configuration. Explain project-specific security mechanics.

## Source precedence

Resolve technical conflicts in this order:

1. current source, Compose files, Terraform, and Makefile;
2. the latest baseline named by `state/CURRENT`;
3. records under `security/` and implementation prompts;
4. historical material under `input/`.

Do not copy an early proposal into user-facing documentation without checking the implementation.

## Writing principles

- Prefer a concrete command, path, endpoint, or identity to a broad description.
- Explain the enforcement mechanism behind a security outcome.
- Separate supported behavior from deliberate demo limitations.
- Distinguish model variability from deterministic policy and database outcomes.
- Keep procedures in execution order and state when a command changes data.
- Use the smallest amount of prose that preserves accuracy.

## Terminology

Use these terms consistently:

| Preferred term | Avoid |
| --- | --- |
| BAD profile, GOOD profile | third synonyms for the profiles |
| delegation depth | hop count, chain depth |
| effective authority | actual permissions |
| authority envelope | permission set, scope when authority is meant |
| authority ceiling | maximum permissions |
| credential lease, lease | token when referring to a database lease |
| Agent A, Agent B, Agent C, Agent D | coordinator/investigator alone after first use |
| Factory API | backend when addressing operators |
| `make reset` | reset script or reset flow without the command |

Use lowercase actor IDs such as `agent-c` only for API identities and code values. Use `factory-bad-role`, `factory-good-role`, and `factory-backend-role` exactly.

## Formatting

- Use one H1 per file and do not skip heading levels.
- Tag executable shell fences with `sh`, JSON with `json`, HTTP examples with `http`, and diagrams or literal output with `text`.
- Use tables for three or more repeated fields or direct comparisons.
- Put commands in copyable blocks. Do not include a shell prompt character.
- Use relative Markdown links between repository documents.
- Keep warnings as concrete prose near the affected step.
- Use sentence case for headings.

## Patterns to remove

The project-local `no-ai-slop` skill supplies the editorial audit. Remove throat-clearing, importance claims, vague attribution, faux quotations, decorative binary contrasts, repeated summaries, fake-profound endings, and mechanical section rhythms.

The BAD versus GOOD comparison is a real technical contrast. Describe its mechanism and evidence without turning unrelated prose into repeated “not this, but that” constructions.

Avoid inflated verbs such as “leverage,” “utilize,” “facilitate,” and “empower” when a plain verb is accurate.

## Approved exceptions

Short project lines already established in the design may appear once where they carry meaning:

> Discovery creates evidence. It does not create authority.

The longer “Break the factory” line belongs to project history or presentation material, not every guide.
