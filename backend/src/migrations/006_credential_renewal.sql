-- 006_credential_renewal.sql — Wave 2.5 (prompts/improvements/01_01_improvement.md
-- section 11.5, "Renewal requirement"): renewLease() existed in
-- backend/src/vault.js from the original Wave 2 pass but was never called
-- anywhere (found live auditing Wave 2's "COMPLETED" status) — a task
-- whose remediation takes longer than its credential's TTL (a real risk:
-- factory-good-role's 150s TTL is shorter than tasks have actually taken
-- live in this project's own local testing) had no way to keep its lease
-- alive. These columns update the SAME credential_events row Wave 2
-- already writes on issuance, rather than a new append-only table — the
-- dashboard's CredentialLedger.vue already renders this table keyed by
-- credential_event_id, so a renewal becomes visible for free.

ALTER TABLE credential_events
    ADD COLUMN IF NOT EXISTS renewal_count  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMPTZ;
