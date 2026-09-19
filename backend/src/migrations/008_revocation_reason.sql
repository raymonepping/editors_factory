-- 008_revocation_reason.sql — Prompt 01.02 Phase 2: revokeCredentialLease
-- already accepted a `reason` parameter (Wave 2) but only ever logged it
-- to the console — audit.markCredentialRevoked() itself took no reason
-- at all, so "why was this revoked" could not be answered from evidence,
-- only from container logs. Distinguishing task_completed from
-- reset/policy_denial/profile_switch in the UI (Codex_Feedback.md) needs
-- it captured as data.

ALTER TABLE credential_events
    ADD COLUMN IF NOT EXISTS revoked_reason TEXT;
