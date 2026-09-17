# compose/infra — PostgreSQL

The factory's order/catalog database. Real data, real mutations, fully
disposable.

## Startup

```bash
make infra-up
```

## Credentials

The `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` values in `.env`
are **Vault management credentials only** — used exactly once by
`terraform/vault-database/` to configure the Database secrets engine's
connection to this instance. No agent, no backend code, and no human
operator ever connects with them directly.

Every real credential used against this database is short-lived and
issued dynamically by Vault:

```text
factory/database/creds/factory-bad-role    (BAD profile — broad DML, 24h TTL)
factory/database/creds/factory-good-role   (GOOD profile — SELECT + UPDATE(status), 120s TTL)
```

See `prompts/base_project/03_01_postgres_dynamic_creds.md` for the exact
grants each role receives, and `security/authority-model.md` for why
this split is the entire BAD/GOOD mechanism.

## Non-goals

No schema, no seed data — that lives in
`prompts/api/01_01_factory_schema_and_tools.md`. This directory is
infrastructure and credential plumbing only.
