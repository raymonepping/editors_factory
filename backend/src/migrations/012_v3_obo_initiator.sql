-- 012_v3_obo_initiator.sql — prompts/v3/03_02.
--
-- Nullable, no default, no CHECK: most runs (CLI-triggered, or any run
-- under sentinel_approle) never have a real human subject and that is
-- correct, not a gap to fill. Snapshotted onto the run the same way
-- authority_mechanism already is (011_v3_authority_mechanism.sql) —
-- read from req.identity.subjectId at the moment a run starts, never
-- retroactively changed.
ALTER TABLE demo_runs
    ADD COLUMN IF NOT EXISTS initiator_subject_id TEXT;
