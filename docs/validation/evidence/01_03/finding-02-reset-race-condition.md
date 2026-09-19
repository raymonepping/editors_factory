# Finding: `/api/demo/reset` can race a concurrently-writing agent-d

**Observed:** `npm --prefix backend test` run 1 of 5 failed one test:
`agent-identity.test.js` — "a JWT stops working the instant its task is
cleared (reset) — structural revocation" — asserting `POST
/api/demo/reset` returns 200; got 500.

**Server-side root cause (from `factory-api` logs at the time):**

```text
[error] POST /api/demo/reset: update or delete on table "demo_runs" violates foreign key constraint "audit_events_run_id_fkey" on table "audit_events"
[error] POST /api/actions/findings: insert or update on table "audit_events" violates foreign key constraint "audit_events_run_id_fkey"
```

`routes/demo.js`'s reset deletes `audit_events` before `demo_runs` in one
multi-statement query — correct in isolation. But `factory-agent-d` is a
real, continuously-running container reacting to the live SSE stream
independently of the test — if it inserts an `audit_events` row (a
`create_finding` call) for the run being reset in the narrow window
between reset's own `DELETE FROM audit_events` and `DELETE FROM
demo_runs` statements, the later statement fails on a row that did not
exist when the batch started. This is a genuine race between one live
background process and reset's own multi-statement transaction, not a
flaw in the test's own logic.

**Reproducibility:** 1 failure in 5 consecutive `npm --prefix backend
test` runs (20%); all 4 subsequent runs passed 24/24 with no code change
in between. Classified as flaky, not deterministic — consistent with a
narrow, timing-dependent race rather than a structural defect that fires
every time.

**Severity:** MEDIUM. Does not corrupt data (the failed statement rolls
back the whole batch — demo_runs and audit_events stay consistent with
each other) and does not affect the documented single-operator demo
flow, where a human is not simultaneously scripting reset calls while
agent-d has independent unflushed work. It is a real repeatability gap
under concurrent/automated conditions (e.g., a CI-style test harness
calling reset repeatedly against a live stack with agent-d always
running) and is worth a permanent fix outside this read-only validation
pass — most directly, having reset retry-on-conflict or briefly quiesce
before its DELETE sequence.

**Not fixed during this validation pass** per the read-only mandate.
