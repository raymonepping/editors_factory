-- 002_evidence.sql — presentation-friendly audit/evidence tables.
-- Deliberately custom, not pgAudit (input/08.md). Every column here maps
-- directly to the event model in input/05.md/input/09.md — the frontend
-- timeline and Agent D both depend on this exact vocabulary.
-- prompts/api/01_01_factory_schema_and_tools.md

CREATE TABLE IF NOT EXISTS demo_runs (
    run_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile     TEXT NOT NULL CHECK (profile IN ('bad', 'good')),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at    TIMESTAMPTZ,
    reset_at    TIMESTAMPTZ,
    status      TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'completed', 'reset'))
);

CREATE TABLE IF NOT EXISTS audit_events (
    event_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                UUID NOT NULL REFERENCES demo_runs(run_id),
    trace_id              UUID NOT NULL,
    task_id               UUID NOT NULL,
    parent_task_id        UUID,
    actor_id              TEXT NOT NULL,
    delegated_by          TEXT,
    delegation_depth      INTEGER NOT NULL DEFAULT 0,
    requested_authority   TEXT,
    effective_authority   TEXT,
    credential_id         TEXT,
    tool_name              TEXT,
    target                TEXT,
    action                TEXT,
    result                TEXT,
    rows_affected         INTEGER,
    "timestamp"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delegations (
    delegation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              UUID NOT NULL REFERENCES demo_runs(run_id),
    from_actor          TEXT NOT NULL,
    to_actor            TEXT NOT NULL,
    task_id             UUID NOT NULL,
    authority_envelope  JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS authority_decisions (
    decision_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id            UUID NOT NULL REFERENCES demo_runs(run_id),
    actor_id          TEXT NOT NULL,
    requested_action  TEXT NOT NULL,
    policy_result     TEXT NOT NULL CHECK (policy_result IN ('ALLOW', 'DENY')),
    reason            TEXT,
    "timestamp"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credential_events (
    credential_event_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id               UUID NOT NULL REFERENCES demo_runs(run_id),
    actor_id             TEXT NOT NULL,
    vault_role           TEXT NOT NULL,
    lease_id             TEXT,
    issued_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    ttl_seconds          INTEGER,
    revoked_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS database_changes (
    change_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id         UUID NOT NULL REFERENCES demo_runs(run_id),
    actor_id       TEXT NOT NULL,
    table_name     TEXT NOT NULL,
    action         TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    before         JSONB,
    after          JSONB,
    rows_affected  INTEGER NOT NULL DEFAULT 0,
    "timestamp"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS findings (
    finding_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                   UUID NOT NULL REFERENCES demo_runs(run_id),
    actor_id                 TEXT NOT NULL DEFAULT 'agent-d',
    severity                 TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title                    TEXT NOT NULL,
    detail                   TEXT,
    correlates_with_event_id UUID REFERENCES audit_events(event_id),
    status                   TEXT NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'acted_on', 'contained')),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_run ON audit_events(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_task ON audit_events(task_id);
CREATE INDEX IF NOT EXISTS idx_delegations_run ON delegations(run_id);
CREATE INDEX IF NOT EXISTS idx_authority_decisions_run ON authority_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_credential_events_run ON credential_events(run_id);
CREATE INDEX IF NOT EXISTS idx_database_changes_run ON database_changes(run_id);
CREATE INDEX IF NOT EXISTS idx_findings_run ON findings(run_id);
