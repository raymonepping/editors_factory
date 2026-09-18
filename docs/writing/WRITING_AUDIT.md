# Writing audit

This audit covers the root `README.md` and first-party Markdown under `docs/`. It uses the style contract and the project-local `no-ai-slop` editorial rules.

## Findings before editing

### Missing reader journey

The repository had no documentation index and no ordered path from installation to architecture, demonstration, and operation. The root README linked mainly to internal records.

### Process records presented as product documentation

Prompts, state captures, and security working files contained valuable facts, but an operator had to reconstruct the system from them. Those records also serve different purposes and use different levels of detail.

### Historical drift

The `input/` material preserved the evolution of the idea. Some details no longer described the implementation, including earlier agent counts, a TypeScript backend assumption, direct Agent C database access, and earlier model names. User-facing prose needed a source-precedence rule.

### Incomplete release criteria

The original release checklist covered versioning and publishing. It did not cover secret hygiene, Compose and Terraform validation, tests, the two security profiles, reset, evidence, or documentation.

### Stale writing policy

The style and quality policies described a four-file scaffold. Freshness and cross-reference checks were optional even though the project now has a completed runtime and user interface.

## Editorial decisions

- Keep the root README short and direct readers into `docs/index.md`.
- Separate operator procedures, system explanation, API details, troubleshooting, and project history.
- Use current source and state captures for facts; use `input/` only for rationale and evolution.
- Name observed implementation constraints when they change an operator action.
- Treat model language and tool selection as variable; treat policy decisions, grants, and database effects as the acceptance evidence.
- Preserve BAD and GOOD as meaningful profile names without adding rhetorical oppositions elsewhere.

## Changes made

The pass added an index and eight focused guides, rewrote the root README and release checklist, and refreshed every writing-policy artifact. Cross-links now form a complete path from setup through release.

Technical statements were checked against the Makefile, Compose files, environment template, API routes, policy code, Terraform, database migrations, agent definitions, current state capture, and a healthy running stack.

## Pattern audit

The final prose avoids marketing claims, fake quotations, generic importance statements, rhetorical questions, vague attribution, decorative conclusions, and repetitive summaries. Terms flagged in the style contract appear only as quoted negative examples where needed.

Passive voice remains in places where the controlled object matters more than the actor, such as a request being denied or a credential being issued. Vale warnings for those sentences require review but do not imply an accuracy problem.
