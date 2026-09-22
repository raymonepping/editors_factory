-- 009_v2_dag_tables.sql — Factory v2 "Retry the work, not the authority":
-- durable state for the recoverable micro-DAG execution engine, added
-- beside v1's existing fixed-chain flow, not replacing it.
-- prompts/v2/02_01_v2_postgres_schema_and_durable_state.md

-- demo_runs already owns the authority profile as `profile` ('bad' |
-- 'good') — see 002_evidence.sql. workflow_mode and fault_injection_mode
-- join it as the other two, orthogonal, per-run controls (02_00's
-- "Single Source of Truth for Run Configuration"); they do NOT go on
-- dag_runs, which holds only v2-specific DAG lifecycle data that has no
-- v1 equivalent.
ALTER TABLE demo_runs
    ADD COLUMN IF NOT EXISTS workflow_mode TEXT NOT NULL DEFAULT 'fixed_chain'
        CHECK (workflow_mode IN ('fixed_chain', 'recoverable_dag')),
    ADD COLUMN IF NOT EXISTS fault_injection_mode TEXT NOT NULL DEFAULT 'none'
        CHECK (fault_injection_mode IN ('none', 'fail_before_mutation', 'fail_after_mutation', 'lock_timeout'));

CREATE TABLE IF NOT EXISTS dag_runs (
    run_id                   UUID PRIMARY KEY REFERENCES demo_runs(run_id) ON DELETE CASCADE,
    workflow_definition_key  TEXT NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    started_at               TIMESTAMPTZ,
    completed_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dag_nodes (
    node_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                   UUID NOT NULL REFERENCES dag_runs(run_id) ON DELETE CASCADE,
    node_key                 TEXT NOT NULL,
    agent_role                TEXT NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'runnable', 'claimed', 'running', 'completed', 'failed', 'blocked', 'invalidated', 'cancelled')),
    current_attempt_number   INTEGER NOT NULL DEFAULT 0,
    current_fencing_token    BIGINT NOT NULL DEFAULT 0,
    claim_token              UUID,
    claimed_by               TEXT,
    claimed_at               TIMESTAMPTZ,
    heartbeat_expires_at     TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dag_nodes_run_key UNIQUE (run_id, node_key)
);

CREATE TABLE IF NOT EXISTS dag_edges (
    edge_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id        UUID NOT NULL REFERENCES dag_runs(run_id) ON DELETE CASCADE,
    from_node_id  UUID NOT NULL REFERENCES dag_nodes(node_id) ON DELETE CASCADE,
    to_node_id    UUID NOT NULL REFERENCES dag_nodes(node_id) ON DELETE CASCADE,
    CONSTRAINT uq_dag_edges UNIQUE (from_node_id, to_node_id)
);

CREATE TABLE IF NOT EXISTS dag_node_attempts (
    attempt_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id                   UUID NOT NULL REFERENCES dag_nodes(node_id) ON DELETE CASCADE,
    attempt_number             INTEGER NOT NULL,
    fencing_token              BIGINT NOT NULL,
    agent_identity             TEXT NOT NULL,
    task_token_jti             TEXT,
    vault_lease_id             TEXT,
    vault_token_accessor       TEXT,
    attempt_idempotency_key    TEXT NOT NULL,
    business_effect_key        TEXT,
    execution_status           TEXT NOT NULL DEFAULT 'running'
                               CHECK (execution_status IN ('running', 'completed', 'failed', 'timed_out')),
    authority_status           TEXT NOT NULL DEFAULT 'active'
                               CHECK (authority_status IN ('active', 'revoked', 'expired')),
    lease_revoked_at           TIMESTAMPTZ,
    revocation_reason          TEXT
                               CHECK (revocation_reason IS NULL OR revocation_reason IN ('attempt_completed', 'attempt_failed', 'watchdog_timeout', 'run_reset')),
    input_evidence              JSONB,
    output_evidence             JSONB,
    error_details                JSONB,
    started_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at                     TIMESTAMPTZ,
    CONSTRAINT uq_dag_node_attempt_num UNIQUE (node_id, attempt_number)
);

-- Business-effect ledger (two-level idempotency, level 2). Level 1
-- (attempt_idempotency_key, above) only de-duplicates delivery within a
-- single attempt; this table is what actually prevents a later attempt
-- from repeating an irreversible mutation an earlier, crashed attempt
-- already committed. business_effect_key is
-- sha256(run_id + node_key + operation + target + payload_hash),
-- claimed via INSERT ... ON CONFLICT DO NOTHING in the same transaction
-- as the mutation it guards — see 02_04 for the consuming pattern.
CREATE TABLE IF NOT EXISTS dag_business_effects (
    business_effect_key  TEXT PRIMARY KEY,
    run_id                UUID NOT NULL REFERENCES dag_runs(run_id) ON DELETE CASCADE,
    node_key              TEXT NOT NULL,
    operation             TEXT NOT NULL,
    target                TEXT NOT NULL,
    payload_hash          TEXT NOT NULL,
    result                JSONB,
    committed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dag_nodes_run ON dag_nodes(run_id);
CREATE INDEX IF NOT EXISTS idx_dag_nodes_run_status ON dag_nodes(run_id, status);
CREATE INDEX IF NOT EXISTS idx_dag_edges_run ON dag_edges(run_id);
CREATE INDEX IF NOT EXISTS idx_dag_edges_from ON dag_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_dag_edges_to ON dag_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_dag_node_attempts_node ON dag_node_attempts(node_id);
CREATE INDEX IF NOT EXISTS idx_dag_business_effects_run ON dag_business_effects(run_id);
