# Finding: factory-api backend DB credential expired without reissue

**Observed at validation start (Phase 0):** `factory-api` container health
check failing (`FailingStreak: 213`, unhealthy for approximately 35+
minutes before observation). `GET /api/health` returned 503:

```json
{"status":"degraded","vault":{"ok":true},"db":{"ok":false,"error":"password authentication failed for user \"v-token-factory--8tlnSl5Ndp9hzsYkmKbV-1789804772\""}}
```

**Root cause:** `factory-backend-role`'s Vault-issued dynamic PostgreSQL
credential has a 1-hour `default_ttl` (`terraform/vault-database/database.tf`,
comment: "reissued by the backend before expiry, not lease-renewed").
The container had been running longer than that TTL with no observed
reissuance — this is a pre-existing, already-documented defect
(`docs/troubleshooting.md`, "API health reports a database error":
*"backend database authentication failed twice after a long run and
recovered after the API restarted. The root cause was not established.
Treat recurrence as an open defect."*). This validation run reproduced
that exact documented defect, independent of and prior to any 01_01/01_02
change.

**Vault itself and Vault Agent's own token were unaffected** (`vault.ok:
true` throughout) — this is specific to the backend's own Postgres
connection pool credential, not the Vault Agent AppRole session or the
agent-c credential-broker path exercised by BAD/GOOD.

**Recovery action taken (documented, non-code):** `podman restart
factory-api`, matching the documented troubleshooting guidance exactly.
Confirmed healthy afterward with a freshly issued credential.

**Disposition:** Recorded as an open finding (pre-existing, not
introduced by 01_01/01_02, already known and documented before this
validation). Not fixed during this pass per the read-only validation
mandate.
