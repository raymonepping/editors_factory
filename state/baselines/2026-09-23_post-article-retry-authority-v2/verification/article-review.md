# Article version 2 editorial verification

The requested article is `article/the-agent-failed-why-does-it-still-have-the-key_2.md`. The directory remains intentionally ignored by Git. This record identifies the reviewed local artifact; it does not include or publish its text.

## Artifact checks

- Version 2: 3,136 words, 35.45% of the 8,846-word published original; within the requested one-third to one-half range.
- Version 2 SHA-256: `beb5d5adadd83289a2b5321697157fd00f766b51f3ecb27ba4def2c778b33100`.
- Preserved version 1 SHA-256: `55acff5ab57fe208d50ad4943a403dbc767d41ad0db952af60ebb4ba2e81aa73`.
- Reader question and author's full response match `input/tweet.md` exactly.
- One H1 and balanced code fences. All three closing Make targets exist.
- Two image placeholders retained for later author-supplied artwork.
- No application source, runtime configuration, or published documentation changed.

## Source grounding

Read the complete published original, Claude's version 1, the tweet thread, all seven `input/v2/` conversations, `docs/v2-whats-new.md`, and `.claude/DESIGN.md`, including decisions 10–13.

Checked current implementation for the material claims:

| Claim | Evidence |
| --- | --- |
| Five-node topology, independent notification branch, operator retry and completion fencing | `backend/src/orchestrator/dag-engine.js`, `backend/src/routes/dag.js` |
| Attempt credentials and direct issuance for active v2 attempts | `backend/src/routes/credentials.js`, `backend/src/middleware/agentJwtAuth.js` |
| Workflow-specific Sentinel metadata requirements | `terraform/vault-sentinel/main.tf`, design decision 11 |
| Unconditional attempt cleanup across profiles | `backend/src/services/revocation.js`, design decision 13 |
| Revocation failure caveat | `revokeCredentialLease()` returns an error result, while `revokeAttempt()` proceeds to mark the attempt revoked; token-accessor errors are caught |
| Business-effect ledger is separate from domain mutation | `claimBusinessEffect()` and mutating routes in `backend/src/routes/actions.js` |
| Residual incomplete-claim risk | Ledger insertion commits before mutation; an existing claim with a null result can return an already-applied response |
| Demonstration and acceptance-test scope | `Makefile`, `backend/test/v2-dag-acceptance.test.js` |
| Live-discovered ledger ordering correction | `docs/v2-whats-new.md`, `state/baselines/2026-09-23_post-v2-02-08-improvements/summary.md`, route implementation |

Historical live-testing observations are attributed to project records. This editorial pass did not rerun mutation scenarios or reproduce the residual failure windows. Those limitations are source-derived findings, not newly observed live incidents.

## No-ai-slop evaluation

Applied `.agents/skills/no-ai-slop/SKILL.md` and every applicable edit check in `eval.md`; also read the equivalent `.claude` skill named by the article prompt.

- Editing principles: PASS. Preserved title, thesis, direct voice, and strong existing sentences. Added detail from supplied evidence; did not invent incidents or quotations. Expanded the recovery explanation to meet the prompt's length and audience requirements.
- Words to cut: PASS. Mechanical scan found no banned phrases; no em dashes. The word “just” in the reader's question remains as an exact quotation.
- Patterns to cut: PASS. Removed theatrical closing lines, repetitive slogans, interpretive commentary, and decorative bold. The requested central thesis and two-line pauses remain deliberate prompt requirements.
- Final read: PASS. The article ends with a concrete demonstration request. The complete draft is delivered as the requested file, with the change summary in the handoff.

## Baseline and commit scope

The first pre-state capture could not reach Podman inside the sandbox and records that limitation. A second pre-state capture with host runtime access and the post-state capture both passed backend health and model-presence checks. All captures are retained for traceability. The capture process records its own new state artifacts as working-tree changes; no unrelated changes were present.

The article prompt authorizes a commit. Only the baseline records and `state/CURRENT` are included in the local commit; the article stays ignored. A scoped manual commit avoids the baseline helper's automatic remote push. No remote publication is part of this editorial task.
