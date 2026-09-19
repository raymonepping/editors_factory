-- 007_evidence_traceability.sql — Prompt 01.02 Phase 1 (input/Codex_Feedback.md):
-- the human subject behind a demo run and the delegation record behind
-- a hop were both only inferable, never directly captured. `username`
-- stored `claims.preferred_username || claims.sub` — a fallback, not a
-- stable field, so the evidence trail's "who initiated this" could
-- silently change if a display name ever did. `delegations.delegation_id`
-- was a primary key nothing else referenced.

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS subject_id TEXT;

-- Nullable: only the root task (human-originated) has a human subject;
-- an agent-to-agent hop's own audit_events row never should.
ALTER TABLE audit_events
    ADD COLUMN IF NOT EXISTS human_subject_id TEXT,
    ADD COLUMN IF NOT EXISTS delegation_id UUID REFERENCES delegations(delegation_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_delegation ON audit_events(delegation_id);
