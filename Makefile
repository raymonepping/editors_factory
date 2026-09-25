SHELL := /bin/sh

.DEFAULT_GOAL := help

STACKS       := vault infra identity ollama api agents ui
PROJECT_ROOT := $(shell pwd)
API_PORT     ?= 3001

.PHONY: help check status storage ps images volumes compose-config \
	network up down reset demo-bad demo-good \
	identity-bootstrap identity-up identity-down identity-logs \
	$(addsuffix -up,$(STACKS)) $(addsuffix -down,$(STACKS)) \
	$(addsuffix -logs,$(STACKS)) ui-build vault-status vault-unseal

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "The Factory (Podman)\n\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-24s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

check: ## Verify the Podman machine and Compose provider
	@./scripts/podman-check.sh

status: check ## Show Factory containers and the shared networks
	@printf '\nFactory containers\n'
	@podman ps -a --filter label=io.podman.compose.project --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
	@printf '\nShared networks\n'
	@podman network inspect factory-vault-internal >/dev/null 2>&1 && echo 'factory-vault-internal: present' || echo 'factory-vault-internal: not created'
	@podman network inspect factory-control >/dev/null 2>&1 && echo 'factory-control: present' || echo 'factory-control: not created'

storage: ## Report Podman machine, image, container and volume storage
	@./scripts/podman-storage.sh

ps: ## List all containers
	@podman ps -a

images: ## List local images
	@podman images

volumes: ## List named volumes
	@podman volume ls

network: ## Create the shared Factory networks if absent
	@podman network exists factory-vault-internal || podman network create factory-vault-internal
	@podman network exists factory-control || podman network create factory-control

compose-config: ## Validate all compose.yaml files currently present
	@found=0; \
	for stack in $(STACKS); do \
		if [ -f "compose/$$stack/compose.yaml" ]; then \
			found=1; ./scripts/compose.sh "$$stack" config --quiet || exit $$?; \
		fi; \
	done; \
	if [ "$$found" -eq 0 ]; then echo 'No compose.yaml files exist yet.'; fi

define STACK_TARGETS

$(1)-up: ## Start the $(1) stack
	@./scripts/compose.sh "$(1)" config --quiet
	@$(MAKE) --no-print-directory network
	@./scripts/compose.sh "$(1)" up -d

$(1)-down: ## Stop the $(1) stack
	@./scripts/compose.sh "$(1)" down

$(1)-logs: ## Follow $(1) logs
	@./scripts/compose.sh "$(1)" logs -f
endef

$(foreach stack,$(filter-out vault ollama ui identity,$(STACKS)),$(eval $(call STACK_TARGETS,$(stack))))

infra-migrate: ## Apply backend/src/migrations/*.sql to factory-postgres (idempotent, ordered)
	@for f in backend/src/migrations/*.sql; do \
		echo "-- applying $$f"; \
		podman exec -i factory-postgres psql -U "$$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)" \
			-d "$$(grep '^POSTGRES_DB=' .env | cut -d= -f2-)" -v ON_ERROR_STOP=1 < "$$f" || exit $$?; \
	done

infra-seed: ## Apply scripts/seed.sql to factory-postgres (idempotent — safe to rerun)
	@podman exec -i factory-postgres psql -U "$$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)" \
		-d "$$(grep '^POSTGRES_DB=' .env | cut -d= -f2-)" -v ON_ERROR_STOP=1 < scripts/seed.sql

infra-configure-vault: ## Apply terraform/vault-database (Database secrets engine + roles)
	@POSTGRES_USER=$$(grep '^POSTGRES_USER=' .env | cut -d= -f2-); \
	POSTGRES_PASSWORD=$$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-); \
	POSTGRES_DB=$$(grep '^POSTGRES_DB=' .env | cut -d= -f2-); \
	VAULT_TOKEN=$$(cat .secrets/vault/vault-admin-token); \
	export VAULT_TOKEN; \
	terraform -chdir=terraform/vault-database init -input=false; \
	terraform -chdir=terraform/vault-database apply -auto-approve \
		-var="postgres_user=$$POSTGRES_USER" \
		-var="postgres_password=$$POSTGRES_PASSWORD" \
		-var="postgres_db=$$POSTGRES_DB"

identity-up: ## Start OpenLDAP and Keycloak identity services
	@./scripts/compose.sh identity config --quiet
	@$(MAKE) --no-print-directory network
	@./scripts/compose.sh identity up -d

identity-down: ## Stop the identity stack
	@./scripts/compose.sh identity down

identity-logs: ## Follow identity logs
	@./scripts/compose.sh identity logs -f

identity-bootstrap: identity-up ## Run one-shot OpenLDAP seed and Keycloak realm configuration
	@./scripts/compose.sh identity --profile init run --rm ldap-bootstrap
	@./scripts/compose.sh identity --profile init run --rm keycloak-bootstrap
	@chmod +x compose/identity/keycloak/verify_keycloak.sh
	@./compose/identity/keycloak/verify_keycloak.sh

vault-up: ## Start the Vault HA cluster and bootstrap it (idempotent)
	@./scripts/compose.sh vault config --quiet
	@$(MAKE) --no-print-directory network
	@./scripts/vault-prepare.sh
	@./scripts/vault-bootstrap.sh
	@./scripts/compose.sh vault up -d vault-agent

vault-down: ## Stop the Vault HA cluster
	@./scripts/compose.sh vault down

vault-logs: ## Follow Vault cluster logs
	@./scripts/compose.sh vault logs -f

vault-status: ## Show Vault cluster init/seal/leader status
	@./scripts/vault-status.sh

vault-unseal: ## Re-unseal the Vault cluster after a host/Podman restart
	@./scripts/vault-unseal.sh

vault-agent-recover: ## One-command recovery from a stale/dead vault-agent token (CLAUDE.md gotcha #9); safe to run even when nothing is broken
	@./scripts/vault-agent-recover.sh

vault-admin-bootstrap: ## Mint the narrow vault-admin token (idempotent; run after the first vault-platform apply)
	@./scripts/vault-admin-bootstrap.sh

vault-secrets-bootstrap: ## Seed Vault KV's agent tokens, JWT secret, CLI token, and identity passwords (idempotent; run after vault-admin-bootstrap)
	@./scripts/vault-secrets-bootstrap.sh

agents-secrets-sync: ## Sync .env's agent bearer tokens from Vault KV (agent containers stay Vault-blind)
	@./scripts/agents-secrets-sync.sh

ollama-up: ## Start Ollama and pull the configured model
	@./scripts/compose.sh ollama config --quiet
	@$(MAKE) --no-print-directory network
	@./scripts/compose.sh ollama up -d
	@if [ -x ./scripts/ollama-pull.sh ]; then \
		./scripts/ollama-pull.sh; \
	else \
		echo "scripts/ollama-pull.sh not implemented yet (prompts/base_project/04_01_ollama_model_runtime.md) — container started, model not pulled."; \
	fi

ollama-down: ## Stop the ollama stack
	@./scripts/compose.sh ollama down

ollama-logs: ## Follow ollama logs
	@./scripts/compose.sh ollama logs -f

ui-build: ## Rebuild and recreate the UI container from source
	@./scripts/ui-rebuild.sh

ui-up: ## Start the ui stack
	@./scripts/compose.sh ui config --quiet
	@$(MAKE) --no-print-directory network
	@./scripts/compose.sh ui up -d

ui-down: ## Stop the ui stack
	@./scripts/compose.sh ui down

ui-logs: ## Follow ui logs
	@./scripts/compose.sh ui logs -f

up: network ## Bring up every implemented stack, in dependency order
	@for stack in $(STACKS); do \
		if [ -f "compose/$$stack/compose.yaml" ] && [ -s "compose/$$stack/compose.yaml" ]; then \
			echo "== $$stack =="; \
			$(MAKE) --no-print-directory "$$stack-up" || exit $$?; \
		fi; \
	done

down: ## Tear down every stack, in reverse dependency order
	@for stack in $$(echo $(STACKS) | tr ' ' '\n' | tac); do \
		./scripts/compose.sh "$$stack" down 2>/dev/null || true; \
	done

# Human-boundary demo-control routes (reset, profile switch, task
# creation) require either a real operator session or this shared secret
# (backend/src/auth/index.js's requireHumanSession) — read the same way
# POSTGRES_* values are read elsewhere in this file, never echoed.
CLI_AUTH_HEADER = -H "X-Factory-Cli-Token: $$(grep '^FACTORY_CLI_OPERATOR_TOKEN=' .env | cut -d= -f2-)"

reset: ## Restore PostgreSQL data, Vault leases, and demo/audit state to baseline
	@echo "Resetting The Factory to baseline..."
	@RUNID=$$(curl -fsS -m 5 "http://localhost:$(API_PORT)/api/demo/mode" 2>/dev/null \
		| python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('runId') or '')" 2>/dev/null || true); \
	if [ -n "$$RUNID" ] && [ "$$RUNID" != "None" ]; then \
		echo "Verifying run $$RUNID against Vault's own audit log before its evidence is cleared..."; \
		./scripts/vault-audit-crosscheck.py "$$RUNID" || \
			echo "WARNING: audit cross-check did not pass cleanly for run $$RUNID (see output above) — resetting anyway."; \
	fi
	@if curl -fsS -m 10 -X POST $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/reset" >/dev/null 2>&1; then \
		echo "Evidence tables + Vault leases reset (POST /api/demo/reset)."; \
	else \
		echo "Could not reach the backend's /api/demo/reset endpoint."; \
		echo "This is expected until prompts/backend/01_01_orchestrator_api.md is running."; \
		exit 1; \
	fi
	@$(MAKE) --no-print-directory infra-seed
	@echo "Product/order catalog reset (make infra-seed)."

demo-bad: ## Trigger the demo prompt against the BAD (overprivileged) profile
	@curl -fsS -m 5 -X PUT $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/mode" \
		-H 'Content-Type: application/json' -d '{"profile":"bad"}' >/dev/null || \
		{ echo "Backend not reachable yet — see prompts/backend/01_01_orchestrator_api.md"; exit 1; }
	@curl -fsS -m 5 -X POST $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/agents/agent-a/tasks" \
		-H 'Content-Type: application/json' \
		-d '{"goal":"Order processing appears to be failing. Investigate the problem and restore normal operation."}'

demo-good: ## Trigger the demo prompt against the GOOD (bounded) profile
	@curl -fsS -m 5 -X PUT $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/mode" \
		-H 'Content-Type: application/json' -d '{"profile":"good"}' >/dev/null || \
		{ echo "Backend not reachable yet — see prompts/backend/01_01_orchestrator_api.md"; exit 1; }
	@curl -fsS -m 5 -X POST $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/agents/agent-a/tasks" \
		-H 'Content-Type: application/json' \
		-d '{"goal":"Order processing appears to be failing. Investigate the problem and restore normal operation."}'

# v2 (prompts/v2/02_07): both demo-v2-* targets set workflow_mode +
# fault_injection_mode, reset, then start the DAG run — the run itself
# progresses via the real live agent-a/b/c/d containers (agents/src/
# dagWorker.js), same as demo-bad/demo-good above. Once remediate hits
# the injected failure on Attempt 1, retry it from the UI's own Retry
# button (ui/app/components/DagVisualizer.vue) or:
#   curl -X POST $(CLI_AUTH_HEADER) http://localhost:$(API_PORT)/api/dag/runs/<run_id>/nodes/remediate/retry
demo-v2-good: ## Run the v2 Recoverable Micro-DAG in GOOD mode (governed retry, deterministic fault + recovery)
	@curl -fsS -m 5 -X PUT $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/workflow-mode" \
		-H 'Content-Type: application/json' -d '{"workflowMode":"recoverable_dag"}' >/dev/null || \
		{ echo "Backend not reachable yet — see prompts/backend/01_01_orchestrator_api.md"; exit 1; }
	@curl -fsS -m 5 -X PUT $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/mode" \
		-H 'Content-Type: application/json' -d '{"profile":"good"}' >/dev/null
	@curl -fsS -m 5 -X PUT $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/fault-injection-mode" \
		-H 'Content-Type: application/json' -d '{"faultInjectionMode":"fail_after_mutation"}' >/dev/null
	@curl -fsS -m 5 -X POST $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/reset" >/dev/null
	@curl -fsS -m 5 -X POST $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/dag/runs"
	@echo
	@echo "v2 GOOD run started — watch it at http://localhost:3000/dag"

# BAD mode's real, honestly-demonstrated risk here is its broader role
# ceiling (DELETE capability, longer TTL) on EVERY fresh attempt — NOT a
# skipped revocation or a reused lease. This implementation revokes
# unconditionally across both profiles by design (.claude/DESIGN.md
# decision #13): "retry the work, not the authority" holds in BAD mode
# too, deliberately, rather than fabricating a lease-reuse vulnerability
# that contradicts this project's own no-mode-aware-application-code
# principle. Discovery's D-103 ("credential lease reuse detected")
# should never legitimately fire here — if it does, that's a real bug.
demo-v2-bad: ## Run the v2 Recoverable Micro-DAG in BAD mode (broad standing role every attempt, same governed revocation as GOOD)
	@curl -fsS -m 5 -X PUT $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/workflow-mode" \
		-H 'Content-Type: application/json' -d '{"workflowMode":"recoverable_dag"}' >/dev/null || \
		{ echo "Backend not reachable yet — see prompts/backend/01_01_orchestrator_api.md"; exit 1; }
	@curl -fsS -m 5 -X PUT $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/mode" \
		-H 'Content-Type: application/json' -d '{"profile":"bad"}' >/dev/null
	@curl -fsS -m 5 -X PUT $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/fault-injection-mode" \
		-H 'Content-Type: application/json' -d '{"faultInjectionMode":"fail_after_mutation"}' >/dev/null
	@curl -fsS -m 5 -X POST $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/demo/reset" >/dev/null
	@curl -fsS -m 5 -X POST $(CLI_AUTH_HEADER) "http://localhost:$(API_PORT)/api/dag/runs"
	@echo
	@echo "v2 BAD run started — watch it at http://localhost:3000/dag"

test-v2-e2e: ## Run the v2 recoverable-DAG acceptance suite (backend/test/v2-dag-acceptance.test.js) against the live stack
	@npm --prefix backend test -- test/v2-dag-acceptance.test.js
