# Documentation toolchain report

The repository already contained the toolchain required by `prompts/process/00_02_docs_style_toolchain.md`. This pass verified and reused it.

## Installed tools

| Tool | State | Purpose |
| --- | --- | --- |
| Vale 3.21.0 | Installed on host | Prose linting |
| `write-good` | Vendored under `docs/writing/config/styles` | Wordiness and clarity rules |
| `alex` | Vendored under `docs/writing/config/styles` | Inclusive-language checks |
| Factory vocabulary | Project-local | Product terms and identifiers |
| `no-ai-slop` | Project-local skill under `.agents/skills` | Manual editorial pattern audit |

No package was installed or upgraded. Avoiding a reinstall preserved the reviewed local configuration.

## Configuration

`.vale.ini` points `StylesPath` at the project-local style directory and enables `write-good`, `alex`, and the Factory vocabulary. The file excludes generated and vendored paths and documents disabled rules.

This pass added vocabulary entries for `auditable`, `overbroad`, `overprivileged`, and `untrusted`. These are required technical terms in the security documentation, not blanket spelling exemptions.

The refreshed style contract lives at `docs/writing/config/STYLE.md`. The quality policy lives at `docs/writing/config/QUALITY.md`.

## Upstream verification

The configuration remains consistent with the official [Vale configuration documentation](https://vale.sh/docs/topics/config/) and [Vale package explorer](https://vale.sh/explorer). The editorial skill was checked against the official [no-ai-slop repository](https://github.com/petergyang/no-ai-slop).

## Commands

Run the prose linter from the repository root:

```sh
vale README.md docs
```

Run the high-signal phrase scan used during this pass:

```sh
rg -n -i '\b(delve|foster|leverage|utilize|facilitate|empower|streamline|robust|seamless|testament)\b' README.md docs --glob '*.md'
```

The scan is a review aid. A match in a quoted rule or an exact technical name does not fail the gate by itself.

## Maintenance

Use `vale sync` only when the project intentionally updates its style packages. Review the resulting vendored diff and rerun the full gate. Do not modify a rule only to hide an accurate finding.
