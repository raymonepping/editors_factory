# Documentation quality gate policy

This policy governs release-facing Markdown in the root `README.md` and `docs/`. It was refreshed on 2026-09-18 for the completed documentation corpus.

## Blocking gates

| Gate | Requirement |
| --- | --- |
| Structural integrity | One H1, ordered headings, closed fences, no malformed tables |
| Link integrity | Every relative file link and heading fragment resolves |
| Vale | No errors; warnings are reviewed against technical intent |
| AI-pattern audit | No unresolved high-impact pattern from the project-local `no-ai-slop` skill |
| Technical accuracy | Commands, paths, ports, identities, and behavior match current source |
| Freshness | No known statement is contradicted by the latest baseline or current configuration |
| Cross-reference completeness | Root README and `docs/index.md` expose every release-facing guide |

A blocking failure produces a `BLOCKED` release decision.

## Advisory gates

| Gate | Requirement |
| --- | --- |
| Style contract | Prose follows `STYLE.md`; justified deviations are recorded |
| Terminology | Preferred terms remain consistent across the corpus |
| Readability | Procedures are scannable and sentences preserve technical meaning |
| Vale warnings | Remaining warnings are reviewed and accepted or corrected |

Advisory findings do not block release unless they conceal an incorrect or unsafe instruction.

## Scope

Included:

- root `README.md`;
- operator and reference guides directly under `docs/`;
- documentation-process records under `docs/writing/`.

Excluded from prose-quality counts, but used for accuracy checks:

- `prompts/` and `input/`;
- `state/` and `security/`;
- source comments;
- vendored Vale package documentation under `docs/writing/config/styles/`.

Component READMEs outside `docs/` remain implementation references. Their links and technical claims should be checked when a release changes that component.

## Vale configuration

The repository uses `.vale.ini`, project-local styles under `docs/writing/config/styles`, the `write-good` and `alex` packages, and the Factory vocabulary. Disabled rules must retain an inline reason in `.vale.ini`.

Vale warnings are advisory because passive constructions can be precise in security documentation. Every warning still requires review; severity is not permission to ignore it.

## Evidence

Each documentation pass records:

- the pre-edit corpus and tool versions in `BASELINE.md`;
- editorial findings in `WRITING_AUDIT.md`;
- completed and deferred work in `WRITING_IMPROVEMENT_PLAN.md`;
- toolchain state in `DOCS_TOOLCHAIN_REPORT.md`;
- final commands, results, exceptions, and release decision in `DOCS_QUALITY_GATE.md`.
