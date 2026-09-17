# The Factory

A local, disposable demonstration of delegated authority in autonomous
AI agents. A chain of Ollama-backed agents (Agent A, an incident
coordinator; Agent B, an operations investigator; Agent C, data
remediation) investigates a synthetic factory order-processing problem.
Depending on the active security profile, Agent C either causes real,
contained damage to a local PostgreSQL database (BAD profile, an
over-broad Vault-issued credential) or is stopped by policy and database
grants before it can (GOOD profile, a narrowly scoped, short-lived
credential). Agent D is a separate, independent lane that continuously
observes A/B/C and raises a live 🟢/🟠/🔴 risk state.

Nothing is simulated. Ollama does the reasoning, Vault issues real
dynamic PostgreSQL credentials, and Agent C runs real SQL against a real,
isolated PostgreSQL instance. The only fake thing is the factory itself.

> **Break the factory. Learn from it. Reset. Repeat. No regrets.**

## Architecture

See [`security/README.md`](security/README.md) for the full identity,
access, trust, observability, containment, and revocation model this
demo proves, and [`security/threat-model.md`](security/threat-model.md)
for what it deliberately does and does not attempt to prove.

The project is built from a numbered set of prompts under
[`prompts/`](prompts/) — each one specifies a slice of the stack in the
order it gets built. Start with
[`prompts/base_project/01_01_factory_stack.md`](prompts/base_project/01_01_factory_stack.md).

## Running it

```bash
make network      # create the shared Podman networks
make up            # bring up every stack that has been implemented so far
make demo-bad      # trigger the demo against the BAD profile
make reset          # restore PostgreSQL, Vault leases, and demo state to baseline
make demo-good     # trigger the same demo against the GOOD profile
```

`make status` shows what's currently running. `make down` tears
everything down. See the [`Makefile`](Makefile) for the full command
list (`make help`).

## Project layout

```text
compose/     Podman Compose files, one stack per subdirectory
scripts/     Operational scripts (Vault bootstrap/unseal/backup, Podman checks, ...)
prompts/     The numbered build/process instructions this project is built from
security/    The durable authority/threat model this project implements
state/       Reproducible, evidence-based project baselines (see state/README.md)
docs/        Generated documentation quality-gate evidence and style contract
```

## License

[GPLv3](LICENSE)
