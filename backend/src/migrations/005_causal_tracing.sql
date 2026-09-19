-- 005_causal_tracing.sql — Wave 4 (prompts/improvements/01_01_improvement.md):
-- only audit_events carried trace_id/task_id before this migration — every
-- other evidence table could only be correlated to the task/trace that
-- produced it via run_id + actor_id + timestamp proximity, not a real key
-- (found live auditing the corpus for Wave 4). Nullable throughout: a row
-- can legitimately have no task context (e.g. Agent D's own background
-- heartbeat has none), and existing rows from before this migration have
-- neither.

ALTER TABLE authority_decisions
    ADD COLUMN IF NOT EXISTS trace_id UUID,
    ADD COLUMN IF NOT EXISTS task_id  UUID;

ALTER TABLE credential_events
    ADD COLUMN IF NOT EXISTS trace_id UUID,
    ADD COLUMN IF NOT EXISTS task_id  UUID;

ALTER TABLE database_changes
    ADD COLUMN IF NOT EXISTS trace_id UUID,
    ADD COLUMN IF NOT EXISTS task_id  UUID;

-- findings.correlates_with_event_id already existed (002_evidence.sql) but
-- only as a FK to audit_events(event_id) — too narrow, since most of Agent
-- D's own signals (D-004/D-004b/D-005/D-007/D-008) fire on
-- authority_decisions/credential_events rows, never audit_events. Dropped
-- in favor of a generic (type, id) pair naming which evidence table the
-- correlated row actually lives in — Postgres has no built-in polymorphic
-- FK, and a real one (a trigger-enforced composite check) is more
-- machinery than this demo's evidence model needs; the four writers of
-- findings.correlates_with_event_id (backend/src/audit.js) only ever set
-- both together, so wrong-type drift beyond that path is not a live risk.
ALTER TABLE findings
    DROP CONSTRAINT IF EXISTS findings_correlates_with_event_id_fkey;

ALTER TABLE findings
    ADD COLUMN IF NOT EXISTS correlates_with_event_type TEXT
        CHECK (correlates_with_event_type IN
               ('audit_events', 'authority_decisions', 'credential_events', 'database_changes'));

CREATE INDEX IF NOT EXISTS idx_authority_decisions_task ON authority_decisions(task_id);
CREATE INDEX IF NOT EXISTS idx_credential_events_task ON credential_events(task_id);
CREATE INDEX IF NOT EXISTS idx_database_changes_task ON database_changes(task_id);
CREATE INDEX IF NOT EXISTS idx_findings_correlates_with_event_id ON findings(correlates_with_event_id);
