#!/usr/bin/env python3
"""scripts/vault-audit-crosscheck.py —
prompts/improvements/01_08_agentic_iam_inspired_hardening.md Phase 1
(app/Vault agreement) and Phase 2 (task-id verification).

Cross-checks the app's own credential_events rows for one run against
Vault's own audit log. The two are independently generated — Vault
audits what it actually did regardless of what the backend writes to
its own evidence tables — so docs/security-model.md's "Preserve the
chain of evidence" and the article's "second witness" claim should be
verifiable, not just asserted. This makes it so.

Also confirms Phase 2's own limit is respected correctly: Sentinel's
require-agent-c-for-db-creds EGP can only verify a task_id was PRESENT
on the child token, not that it was the CORRECT one — this script is
what actually checks correctness, by comparing the task_id Vault's
audit log recorded in the token's own metadata against
credential_events.task_id for the same lease.

Reads the audit log directly off each Vault node's own container
filesystem. Only the Raft node that was ACTUALLY LEADER at the moment
of a given request wrote that entry locally — a follower never sees a
request it forwarded — so leadership having moved during a run (found
live: vault-1's log is ~3x vault-3's, vault-2's is empty) means one
node alone is not the whole story. This reads all three and merges
them rather than assuming leadership stayed put.

Lease IDs and token metadata (including factory_agent) are cleartext
in Vault's audit log by default; usernames and passwords are HMAC'd —
confirmed live by inspecting a real entry before writing this, not
assumed from documentation.

v2 (prompts/v2/02_05): extends the same issuance-side cross-check with
factory_attempt_id (mirroring factory_task exactly — same cleartext
auth.metadata on the same database/creds/* request entry), and adds a
GOOD-mode duplicate-lease check across a node's own attempts. Does NOT
attempt to match individual sys/leases/revoke audit entries back to a
specific lease_id — confirmed live before writing this that
request.data.lease_id on a revoke call is HMAC-salted (unlike the
cleartext response.secret.lease_id on issuance), so a revoke entry
cannot be tied to one lease from the audit log's own cleartext fields
without Vault's internal HMAC salt, which is not exposed to this
script. Revocation is instead checked the honest way available: against
the app's own dag_node_attempts.authority_status, which is not
independent Vault corroboration, and is reported as such.

Usage:
  ./scripts/vault-audit-crosscheck.py <run_id>
  ./scripts/vault-audit-crosscheck.py --latest
"""

import json
import subprocess
import sys

NODES = ["factory-vault_1", "factory-vault_2", "factory-vault_3"]
ROLE_PATHS = {"database/creds/factory-bad-role", "database/creds/factory-good-role"}
SENTINEL_POLICY = "require-agent-c-for-db-creds"


def read_audit_log(container):
    try:
        out = subprocess.run(
            ["podman", "exec", container, "cat", "/vault/audit/vault-audit.log"],
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        )
    except subprocess.CalledProcessError as e:
        print(
            f"warning: could not read audit log from {container}: {e.stderr.strip()}",
            file=sys.stderr,
        )
        return []
    entries = []
    for line in out.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return entries


def load_all_entries():
    entries = []
    for node in NODES:
        entries.extend(read_audit_log(node))
    return entries


def psql(sql, pguser, pgdb):
    out = subprocess.run(
        [
            "podman",
            "exec",
            "factory-postgres",
            "psql",
            "-U",
            pguser,
            "-d",
            pgdb,
            "-t",
            "-A",
            "-F",
            "|",
            "-c",
            sql,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return [line for line in out.stdout.splitlines() if line.strip()]


def get_env(key):
    with open(".env") as f:
        for line in f:
            if line.startswith(f"{key}="):
                return line.strip().split("=", 1)[1]
    raise SystemExit(f"{key} not found in .env")


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(64)
    run_id_arg = sys.argv[1]

    pguser = get_env("POSTGRES_USER")
    pgdb = get_env("POSTGRES_DB")

    if run_id_arg == "--latest":
        rows = psql(
            "SELECT run_id FROM demo_runs ORDER BY started_at DESC LIMIT 1",
            pguser,
            pgdb,
        )
        if not rows:
            print("No demo runs found.")
            sys.exit(1)
        run_id = rows[0]
    else:
        run_id = run_id_arg

    print(f"Cross-checking run {run_id}...\n")

    db_rows = psql(
        f"SELECT vault_role, lease_id, actor_id, task_id FROM credential_events "
        f"WHERE run_id='{run_id}' AND lease_id IS NOT NULL",
        pguser,
        pgdb,
    )
    db_leases = {}
    for row in db_rows:
        vault_role, lease_id, actor_id, task_id = row.split("|")
        db_leases[lease_id] = {
            "vault_role": vault_role,
            "actor_id": actor_id,
            "task_id": task_id or None,
        }

    if not db_leases:
        print(
            f"No credential_events rows with a lease for run {run_id} — nothing to cross-check."
        )
        sys.exit(0)

    # v2 (02_05): dag_node_attempts rows for this run with an issued
    # lease, keyed by lease_id — the attempt_id this lease SHOULD carry
    # in Vault's own token metadata, per node's own current attempt.
    dag_attempt_rows = psql(
        f"SELECT a.vault_lease_id, a.attempt_id, a.attempt_number, n.node_key, n.node_id "
        f"FROM dag_node_attempts a JOIN dag_nodes n ON n.node_id = a.node_id "
        f"WHERE n.run_id='{run_id}' AND a.vault_lease_id IS NOT NULL",
        pguser,
        pgdb,
    )
    dag_attempts_by_lease = {}
    node_leases = {}  # node_id -> [(attempt_id, lease_id), ...]
    for row in dag_attempt_rows:
        lease_id, attempt_id, attempt_number, node_key, node_id = row.split("|")
        dag_attempts_by_lease[lease_id] = {
            "attempt_id": attempt_id,
            "attempt_number": attempt_number,
            "node_key": node_key,
            "node_id": node_id,
        }
        node_leases.setdefault(node_id, []).append((attempt_id, lease_id))

    entries = load_all_entries()
    requests_by_id = {
        e["request"]["id"]: e
        for e in entries
        if e.get("type") == "request" and e.get("request", {}).get("path") in ROLE_PATHS
    }

    audit_leases = {}
    for e in entries:
        if e.get("type") != "response":
            continue
        lease_id = e.get("response", {}).get("secret", {}).get("lease_id")
        if not lease_id:
            continue
        response_path = e.get("request", {}).get("path")
        req_entry = requests_by_id.get(e.get("request", {}).get("id"))
        agent = None
        task_id = None
        sentinel_checked = False
        attempt_id = None
        if req_entry:
            metadata = req_entry.get("auth", {}).get("metadata", {}) or {}
            agent = metadata.get("factory_agent")
            task_id = metadata.get("factory_task")
            attempt_id = metadata.get("factory_attempt_id")
            granting = (
                req_entry.get("auth", {})
                .get("policy_results", {})
                .get("granting_policies", [])
            )
            sentinel_checked = any(p.get("name") == SENTINEL_POLICY for p in granting)
        # 01_08 Phase 4: a Control-Group-gated credential is delivered
        # via sys/wrapping/unwrap, a genuinely different request/response
        # pair from the original database/creds/* one that returned
        # wrap_info instead of the lease — found live that the wrap
        # token carries none of the original child token's metadata
        # forward, so agent/task/Sentinel are not independently
        # re-checkable here for this path, only the lease's existence
        # is. That is still real corroboration (Vault, not the app,
        # generated this exact lease id) — just a narrower claim than
        # the direct-issuance case makes, and reported as such rather
        # than treated as a match failure.
        via_unwrap = response_path == "sys/wrapping/unwrap"
        audit_leases[lease_id] = {
            "agent": agent,
            "task_id": task_id,
            "attempt_id": attempt_id,
            "sentinel_checked": sentinel_checked,
            "via_unwrap": via_unwrap,
        }

    ok = True
    print(f"{'lease_id':<68} {'app':<8} {'vault':<8} {'sentinel':<9} note")
    for lease_id, db_info in db_leases.items():
        vault_info = audit_leases.get(lease_id)
        if vault_info is None:
            print(f"{lease_id:<68} {'FOUND':<8} {'MISSING':<8} {'-':<9}")
            ok = False
            continue
        if vault_info["via_unwrap"]:
            # Control-Group-delivered: the lease itself is corroborated
            # (Vault, not the app, generated this exact id), but agent/
            # task/Sentinel metadata isn't independently re-checkable
            # from this path's own audit entries — see the comment
            # above. Not a failure; a narrower, honestly-labeled claim.
            print(
                f"{lease_id:<68} {'FOUND':<8} {'FOUND':<8} {'n/a':<9} "
                "delivered via Control Group unwrap — lease corroborated, "
                "metadata not independently re-checkable this way"
            )
            continue
        notes = []
        if vault_info["agent"] != db_info["actor_id"]:
            notes.append(
                f"agent mismatch: app={db_info['actor_id']} vault={vault_info['agent']}"
            )
            ok = False
        if db_info["task_id"] and vault_info["task_id"] != db_info["task_id"]:
            notes.append(
                f"task mismatch: app={db_info['task_id']} vault={vault_info['task_id']}"
            )
            ok = False
        # v2 (02_05): same comparison, following the task_id pattern
        # exactly, for the lease's dag_node_attempts row when this lease
        # belongs to a recoverable_dag attempt (dag_attempts_by_lease has
        # no entry at all for a fixed_chain / v1 lease).
        dag_info = dag_attempts_by_lease.get(lease_id)
        if dag_info and vault_info["attempt_id"] != dag_info["attempt_id"]:
            notes.append(
                f"attempt mismatch: app={dag_info['attempt_id']} vault={vault_info['attempt_id']}"
            )
            ok = False
        if not vault_info["sentinel_checked"]:
            ok = False
        print(
            f"{lease_id:<68} {'FOUND':<8} {'FOUND':<8} "
            f"{'yes' if vault_info['sentinel_checked'] else 'NO':<9} {'; '.join(notes)}"
        )

    # v2 (02_05, item 4): "Fail validation if any Attempt 2 event shares
    # a lease_id with Attempt 1 in GOOD mode" — checkable directly from
    # this run's own dag_node_attempts rows, no Vault audit log needed.
    # Under this project's actual implementation (backend/src/vault.js's
    # mintAgentTaggedChildToken mints a genuinely fresh lease on every
    # issueDatabaseCredential call) this should never fire for a real
    # attempt — a match here indicates a real bug, not an intended
    # BAD-mode demonstration (see .claude/DESIGN.md's own entry on why
    # revocation and fresh-lease issuance are unconditional across both
    # profiles in this implementation, not profile-branched).
    good_role_leases = psql(
        f"SELECT lease_id FROM credential_events WHERE run_id='{run_id}' "
        f"AND vault_role='factory-good-role' AND lease_id IS NOT NULL",
        pguser,
        pgdb,
    )
    good_role_lease_set = set(good_role_leases)
    for node_id, pairs in node_leases.items():
        good_pairs = [p for p in pairs if p[1] in good_role_lease_set]
        seen_leases = {}
        for attempt_id, lease_id in good_pairs:
            if lease_id in seen_leases and seen_leases[lease_id] != attempt_id:
                print(
                    f"FAIL — GOOD-mode lease reuse: node {node_id} attempts "
                    f"{seen_leases[lease_id]} and {attempt_id} both used lease {lease_id}."
                )
                ok = False
            seen_leases[lease_id] = attempt_id

    # v2 (02_05, item 2's revocation half): not independently checkable
    # against the Vault audit log itself (see module docstring), so this
    # reports the app's own dag_node_attempts.authority_status honestly
    # as an application-level check, not Vault corroboration.
    if dag_attempts_by_lease:
        unrevoked_terminal = psql(
            f"SELECT a.attempt_id, n.node_key FROM dag_node_attempts a "
            f"JOIN dag_nodes n ON n.node_id = a.node_id "
            f"WHERE n.run_id='{run_id}' AND a.vault_lease_id IS NOT NULL "
            f"AND a.execution_status IN ('completed','failed','timed_out') "
            f"AND a.authority_status != 'revoked'",
            pguser,
            pgdb,
        )
        if unrevoked_terminal:
            for row in unrevoked_terminal:
                attempt_id, node_key = row.split("|")
                print(
                    f'FAIL — attempt {attempt_id} of "{node_key}" reached a terminal '
                    f"execution_status with its authority still not revoked (app-level "
                    f"check, not independent Vault corroboration — see module docstring)."
                )
            ok = False
        else:
            print(
                f"App-level check: all {len(dag_attempts_by_lease)} v2 attempt(s) with a "
                f"lease in run {run_id} show authority_status='revoked' after reaching a "
                f"terminal state (not independent Vault corroboration)."
            )

    unwrap_count = sum(
        1 for l in db_leases if audit_leases.get(l, {}).get("via_unwrap")
    )
    print()
    if ok:
        direct_count = len(db_leases) - unwrap_count
        detail = (
            f"{direct_count} directly issued, Sentinel-checked" if direct_count else ""
        )
        if unwrap_count:
            detail += (
                (", " if detail else "")
                + f"{unwrap_count} delivered via a Control Group approval (lease corroborated; "
                "see docs/security-model.md for what that path can and cannot independently re-verify)"
            )
        print(
            f"PASS — all {len(db_leases)} credential_events row(s) for run {run_id} are "
            f"independently corroborated by Vault's own audit log ({detail})."
        )
        sys.exit(0)
    print("FAIL — see rows above.")
    sys.exit(1)


if __name__ == "__main__":
    main()
