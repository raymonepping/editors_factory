-- 003_functions.sql — status-only order update, exposed via a function
-- rather than a column-level GRANT.
--
-- Found live building prompts/backend/01_01_orchestrator_api.md's
-- factory-good-role credential flow: Vault's PostgreSQL secrets engine
-- reliably drops a `GRANT UPDATE (status) ON orders TO "{{name}}"`
-- statement (the column-list form) from creation_statements — confirmed
-- reproducible across single- and multi-statement array forms, with and
-- without a space before the parenthesis, using both root and
-- AppRole-derived Vault tokens. A plain table-level `GRANT UPDATE ON
-- orders` (no column list) applies reliably every time. A SECURITY
-- DEFINER function sidesteps the column-list GRANT syntax entirely —
-- `GRANT EXECUTE ON FUNCTION ...` is a different, working grant form —
-- while still only ever letting the caller change `status`, nothing else.

CREATE OR REPLACE FUNCTION set_order_status(p_order_id integer, p_status text)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result orders;
BEGIN
    UPDATE orders
    SET status = p_status, updated_at = now()
    WHERE id = p_order_id
    RETURNING * INTO result;
    RETURN result;
END;
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default — that
-- would hand every dynamically-issued role (bad, good, or backend) this
-- capability implicitly. Revoke it so each Vault role's
-- creation_statements has to grant EXECUTE explicitly
-- (terraform/vault-database/database.tf), same discipline as every
-- other privilege in this schema.
REVOKE EXECUTE ON FUNCTION set_order_status(integer, text) FROM PUBLIC;

