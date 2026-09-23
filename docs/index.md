# The Factory documentation

The Factory shows how authority can expand across an agent delegation chain and how layered controls contain that expansion. It is a local demonstration, not a production service.

## Guided path

1. [Getting started](getting-started.md) prepares a clean checkout and starts the stack.
2. [Architecture](architecture.md) explains the components and control flow; the [architecture diagram](architecture_diagram.md) maps the runtime, identity, credential, and evidence paths.
3. [Security model](security-model.md) defines authority, credentials, and enforcement boundaries.
4. [Demo guide](demo-guide.md) runs the BAD and GOOD profiles and interprets the evidence.
5. [Operations](operations.md) covers routine lifecycle, reset, backup, and diagnostics.

## Reference

- [What's new in v2](v2-whats-new.md) is the canonical overview of the recoverable micro-DAG execution mode — start here for v2.
- [API reference](api-reference.md) lists public, human-triggered, and agent-authenticated endpoints.
- [Troubleshooting](troubleshooting.md) records known failure modes and fixes found during implementation.
- [Project history](project-history.md) traces the design from the initial concept to the current system.
- [Release checklist](release-checklist.md) is the final pre-release procedure.

## Engineering records

These sources explain how the project was built, but they are not operator documentation:

- `prompts/` contains implementation contracts.
- `input/` contains early design discussions and research notes.
- `state/` contains redacted milestone captures and validation summaries.
- `security/` contains the detailed authority model, including container-isolation rules.

When these sources disagree, current code and the latest captured state take precedence. The latest baseline name is stored in `state/CURRENT`.

## Documentation standards

The writing rules live in the [style contract](writing/config/STYLE.md). Release-facing documentation must pass the checks in [the quality gate](writing/DOCS_QUALITY_GATE.md).
