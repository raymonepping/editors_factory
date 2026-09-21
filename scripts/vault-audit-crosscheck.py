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
        req_entry = requests_by_id.get(e.get("request", {}).get("id"))
        agent = None
        task_id = None
        sentinel_checked = False
        if req_entry:
            metadata = req_entry.get("auth", {}).get("metadata", {}) or {}
            agent = metadata.get("factory_agent")
            task_id = metadata.get("factory_task")
            granting = (
                req_entry.get("auth", {})
                .get("policy_results", {})
                .get("granting_policies", [])
            )
            sentinel_checked = any(p.get("name") == SENTINEL_POLICY for p in granting)
        audit_leases[lease_id] = {
            "agent": agent,
            "task_id": task_id,
            "sentinel_checked": sentinel_checked,
        }

    ok = True
    print(f"{'lease_id':<68} {'app':<8} {'vault':<8} {'sentinel':<9} note")
    for lease_id, db_info in db_leases.items():
        vault_info = audit_leases.get(lease_id)
        if vault_info is None:
            print(f"{lease_id:<68} {'FOUND':<8} {'MISSING':<8} {'-':<9}")
            ok = False
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
        if not vault_info["sentinel_checked"]:
            ok = False
        print(
            f"{lease_id:<68} {'FOUND':<8} {'FOUND':<8} "
            f"{'yes' if vault_info['sentinel_checked'] else 'NO':<9} {'; '.join(notes)}"
        )

    print()
    if ok:
        print(
            f"PASS — all {len(db_leases)} credential_events row(s) for run {run_id} are "
            "independently corroborated by Vault's own audit log, with the Sentinel "
            "policy confirmed evaluated for each."
        )
        sys.exit(0)
    print("FAIL — see rows above.")
    sys.exit(1)


if __name__ == "__main__":
    main()
