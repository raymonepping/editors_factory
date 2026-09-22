-- 010_v2_retry_revocation_reason.sql — 009's dag_node_attempts.revocation_reason
-- CHECK only allowed attempt_completed/attempt_failed/watchdog_timeout/
-- run_reset. retryNode() (02_02) can invalidate a still-active downstream
-- attempt when an operator retries an upstream node mid-flight — a real,
-- distinct cause the existing four values don't honestly describe
-- ("run_reset" would misrepresent a selective retry as a full demo
-- reset in the evidence trail). Matches 008_revocation_reason.sql's own
-- precedent of a small, targeted follow-up migration.

ALTER TABLE dag_node_attempts DROP CONSTRAINT IF EXISTS dag_node_attempts_revocation_reason_check;
ALTER TABLE dag_node_attempts ADD CONSTRAINT dag_node_attempts_revocation_reason_check
    CHECK (revocation_reason IS NULL OR revocation_reason IN
        ('attempt_completed', 'attempt_failed', 'watchdog_timeout', 'run_reset', 'downstream_invalidated'));
