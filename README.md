# The Factory

The Factory is a local security demonstration of authority propagation through an autonomous agent chain. The same task runs under two profiles:

- **BAD** gives the remediation agent a fixed, overprivileged authority ceiling.
- **GOOD** limits that agent to the actions needed for recovery.

Both profiles use the same agents, API routes, and database tools. The difference is enforced authority: application policy, Vault policy, short-lived database credentials, and PostgreSQL grants. Every delegation, decision, credential lease, finding, and database change is recorded for inspection.

> Discovery creates evidence. It does not create authority.

## Start here

Read the [documentation index](docs/index.md) for the guided path. New operators should begin with [Getting started](docs/getting-started.md), then use the [Demo guide](docs/demo-guide.md).

```sh
make help
make check
make status
```

The dashboard runs at `http://localhost:3000` and the API at `http://localhost:3001` after the stack is configured and started.

## What runs locally

The project uses Podman Compose to run:

- a three-node Vault Enterprise cluster with a separate transit seal;
- Vault Agent with AppRole auto-authentication;
- PostgreSQL with Vault-issued dynamic credentials;
- Ollama with `qwen3:4b-instruct` by default;
- four isolated Node.js agent containers;
- an Express orchestration and policy API;
- a Nuxt dashboard with a live event stream.

Vault Enterprise license files and values are required. No cloud model provider is needed.

## Common commands

```sh
make up          # Start implemented stacks in dependency order
make status      # Show containers and shared networks
make demo-bad    # Run the overprivileged profile
make reset       # Revoke leases and restore the demo baseline
make demo-good   # Run the bounded profile
make down        # Stop all stacks in reverse order
```

First-time provisioning has additional Vault and Terraform steps. Follow [Getting started](docs/getting-started.md) before running `make up` on a clean checkout.

## Documentation

- [Architecture](docs/architecture.md)
- [Security model](docs/security-model.md)
- [Demo guide](docs/demo-guide.md)
- [Operations](docs/operations.md)
- [API reference](docs/api-reference.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Project history](docs/project-history.md)
- [Release checklist](docs/release-checklist.md)

The implementation prompts in `prompts/`, historical design material in `input/`, and captured milestones in `state/` remain engineering records. The files under `docs/` describe the current product.

## License

[GPLv3](LICENSE)
