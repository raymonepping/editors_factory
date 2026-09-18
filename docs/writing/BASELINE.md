# Documentation baseline

Captured before the 2026-09-18 documentation pass required by `prompts/process/00_02_docs_style_toolchain.md`.

## Repository state

| Item | Baseline |
| --- | --- |
| Commit | `7f00b40` |
| Current state capture | `2026-09-18_post-responsive-scaling` |
| Root README files | 1 |
| Markdown files under `docs/` | 10, including two vendored Vale package READMEs |
| Documentation index | Missing |
| Operator guides | Missing |
| Existing release document | Short tag-and-publish checklist |

The worktree was clean at the start of this documentation pass. Earlier UI and API work had reached the current commit before editing began.

## Existing documentation condition

The root README described the intended architecture and a few Make targets. It did not explain clean installation, Vault and Terraform provisioning, the completed four-agent flow, the API, live operations, or troubleshooting.

The only release-facing file under `docs/` was `release-checklist.md`. The other first-party files were writing-tool reports created when the repository still contained scaffold documentation. Their scope notes and conclusions no longer matched the mature project.

Useful implementation records existed under `security/`, `prompts/`, `state/`, component READMEs, and source comments. Historical files under `input/` explained design intent but also contained superseded details.

## Tool baseline

| Check | Result |
| --- | --- |
| Vale | 3.21.0 installed |
| Vale styles | Project-local `write-good` and `alex` present |
| Factory vocabulary | Present |
| Project-local editorial skill | `.agents/skills/no-ai-slop` present |
| Initial focused Vale run | 3 warnings across root README and release checklist |
| Initial full first-party run | 54 warnings, no errors or suggestions |

The full count excludes vendored style package prose from editorial decisions. Warnings mainly came from passive voice and wordiness rules in the generated writing reports.

## Baseline risks

- No `docs/index.md` exposed a reader path.
- Setup details were distributed across Makefile comments, prompts, Terraform outputs, and `.env.example`.
- Early design notes could mislead readers about the backend language, model, agent count, and credential path.
- The release checklist did not validate the running security demonstration.
- Writing policies still said the project had no mature documentation.
