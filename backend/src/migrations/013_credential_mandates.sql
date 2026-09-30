-- 013_credential_mandates.sql — bind a bounded credential to specific
-- records and transitions, enforced by PostgreSQL itself.
--
-- Found answering a reader question on Part I ("what about harmful
-- mutations that stay within legitimately granted permissions?"): the
-- GOOD corrector's only write path, set_order_status(id, status), used to
-- accept ANY order and ANY valid status. Its permission was scoped to an
-- action, not to a target or a transition. Proven live before this
-- migration: in GOOD mode, with a real delegation chain and a real
-- 2-minute factory-good-role credential, agent-c set order 2 from
-- `fulfilled` to `cancelled` — HTTP 200, recorded, and not flagged.
--
-- The fix is a mandate: when the backend issues a bounded credential it
-- writes the exact (order, from_status, to_status) rows that credential
-- may perform. Bounded credentials carry the marker role
-- factory_bound_corrector (granted in factory-good-role's
-- creation_statements, terraform/vault-database/database.tf), and for
-- members of that role set_order_status refuses anything without a
-- matching mandate row. This holds even if the backend is bypassed: the
-- check runs inside the database, against session_user — the dynamic,
-- Vault-issued login — which a SECURITY DEFINER function cannot change.
--
-- The BAD profile's role does not carry the marker, on purpose: its
-- unbounded authority is the demonstrated flaw.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'factory_bound_corrector') THEN
        CREATE ROLE factory_bound_corrector NOLOGIN;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS credential_mandates (
    db_user      TEXT        NOT NULL,          -- the Vault-issued PostgreSQL login
    order_id     INTEGER     NOT NULL,
    from_status  TEXT        NOT NULL,
    to_status    TEXT        NOT NULL,
    task_id      TEXT,
    granted_via  TEXT        NOT NULL DEFAULT 'mandate'
                 CHECK (granted_via IN ('mandate', 'control_group')),
    reason       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (db_user, order_id, from_status, to_status)
);

CREATE OR REPLACE FUNCTION set_order_status(p_order_id integer, p_status text)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_status text;
    result orders;
BEGIN
    IF pg_has_role(session_user, 'factory_bound_corrector', 'MEMBER') THEN
        SELECT status INTO current_status FROM orders WHERE id = p_order_id FOR UPDATE;
        IF NOT EXISTS (
            SELECT 1 FROM credential_mandates
             WHERE db_user = session_user
               AND order_id = p_order_id
               AND from_status = current_status
               AND to_status = p_status
        ) THEN
            RAISE EXCEPTION 'outside mandate: order % may not change from % to % under this credential',
                p_order_id, coalesce(current_status, '(missing)'), p_status
                USING ERRCODE = '42501';
        END IF;
    END IF;

    UPDATE orders
    SET status = p_status, updated_at = now()
    WHERE id = p_order_id
    RETURNING * INTO result;
    RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_order_status(integer, text) FROM PUBLIC;
