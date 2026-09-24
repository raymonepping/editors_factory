-- 011_v3_authority_mechanism.sql — prompts/v3/03_01.
--
-- A fourth orthogonal per-run control alongside profile, workflow_mode,
-- and fault_injection_mode (009_v2_dag_tables.sql). "sentinel_approle"
-- is every existing credential path this project has ever had; the new
-- "vault_native_oauth" value routes Agent C's credential request
-- through the v3 root-scoped path instead (routes/credentials.js,
-- vault.js's issueV3OAuthCredential, terraform/vault-platform/
-- v3-root-credential-path.tf). Switching this never touches
-- workflow_mode/profile/fault_injection_mode, and vice versa.
ALTER TABLE demo_runs
    ADD COLUMN IF NOT EXISTS authority_mechanism TEXT NOT NULL DEFAULT 'sentinel_approle'
        CHECK (authority_mechanism IN ('sentinel_approle', 'vault_native_oauth'));
