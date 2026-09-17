SHELL := /bin/sh

.DEFAULT_GOAL := help

STACKS       := vault infra ollama api agents ui
PROJECT_ROOT := $(shell pwd)
API_PORT     ?= 3001

.PHONY: help check status storage ps images volumes compose-config \
	network up down reset demo-bad demo-good \
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

$(foreach stack,$(filter-out vault ollama ui,$(STACKS)),$(eval $(call STACK_TARGETS,$(stack))))

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
	@# Deliberately do NOT `set -a; . ./.env` here: .env carries
	@# VAULT_NAMESPACE=factory (for the backend's future use), and every
	@# resource in this module already sets namespace = "factory"
	@# explicitly. Exporting VAULT_NAMESPACE too double-scopes the
	@# provider on top of that ("Namespace: factory/factory", 403) —
	@# found live. Pull only the three POSTGRES_* values needed.
	@POSTGRES_USER=$$(grep '^POSTGRES_USER=' .env | cut -d= -f2-); \
	POSTGRES_PASSWORD=$$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-); \
	POSTGRES_DB=$$(grep '^POSTGRES_DB=' .env | cut -d= -f2-); \
	VAULT_TOKEN=$$(jq -er '.root_token' .secrets/vault/cluster-init.json); \
	export VAULT_TOKEN; \
	terraform -chdir=terraform/vault-database init -input=false; \
	terraform -chdir=terraform/vault-database apply -auto-approve \
		-var="postgres_user=$$POSTGRES_USER" \
		-var="postgres_password=$$POSTGRES_PASSWORD" \
		-var="postgres_db=$$POSTGRES_DB"

vault-up: ## Start the Vault HA cluster and bootstrap it (idempotent)
	@./scripts/compose.sh vault config --quiet
	@$(MAKE) --no-print-directory network
	@./scripts/vault-prepare.sh
	@./scripts/vault-bootstrap.sh
	@# vault-bootstrap.sh brings up vault-s first, creates the transit
	@# auto-unseal token, THEN brings up vault-1/2/3 itself — found live:
	@# an extra `compose.sh vault up -d` here (bringing up all four nodes
	@# at once, before the transit-token file exists) makes Podman
	@# auto-create .secrets/vault/transit-token as an empty DIRECTORY
	@# (the bind-mount source didn't exist yet), which then makes
	@# vault-bootstrap.sh's own `[ -s transit-token ]` check true for the
	@# wrong reason and crashes on `cat` a few lines later — and leaves
	@# vault-1/2/3 crash-looping on 403s in the meantime, since they never
	@# got a real token. Do not add a separate `up -d` call here.

vault-down: ## Stop the Vault HA cluster
	@./scripts/compose.sh vault down

vault-logs: ## Follow Vault cluster logs
	@./scripts/compose.sh vault logs -f

vault-status: ## Show Vault cluster init/seal/leader status
	@./scripts/vault-status.sh

vault-unseal: ## Re-unseal the Vault cluster after a host/Podman restart
	@./scripts/vault-unseal.sh

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

reset: ## Restore PostgreSQL data, Vault leases, and demo/audit state to baseline
	@echo "Resetting The Factory to baseline..."
	@# Two separately-scoped steps, not one — see
	@# backend/src/routes/demo.js's own comment for why: the backend's
	@# factory-backend-role credential is deliberately NOT privileged to
	@# mutate products/orders/inventory (only Agent C's factory-bad-role/
	@# factory-good-role ever does that), so it can only reset what it
	@# owns (Vault leases + evidence tables). The product/order catalog
	@# reset uses the Postgres superuser instead, same as first seeding.
	@if curl -fsS -m 10 -X POST "http://localhost:$(API_PORT)/api/demo/reset" >/dev/null 2>&1; then \
		echo "Evidence tables + Vault leases reset (POST /api/demo/reset)."; \
	else \
		echo "Could not reach the backend's /api/demo/reset endpoint."; \
		echo "This is expected until prompts/backend/01_01_orchestrator_api.md is running."; \
		exit 1; \
	fi
	@$(MAKE) --no-print-directory infra-seed
	@echo "Product/order catalog reset (make infra-seed)."

demo-bad: ## Trigger the demo prompt against the BAD (overprivileged) profile
	@curl -fsS -m 5 -X PUT "http://localhost:$(API_PORT)/api/demo/mode" \
		-H 'Content-Type: application/json' -d '{"profile":"bad"}' >/dev/null || \
		{ echo "Backend not reachable yet — see prompts/backend/01_01_orchestrator_api.md"; exit 1; }
	@curl -fsS -m 5 -X POST "http://localhost:$(API_PORT)/api/agents/agent-a/tasks" \
		-H 'Content-Type: application/json' \
		-d '{"goal":"Order processing appears to be failing. Investigate the problem and restore normal operation."}'

demo-good: ## Trigger the demo prompt against the GOOD (bounded) profile
	@curl -fsS -m 5 -X PUT "http://localhost:$(API_PORT)/api/demo/mode" \
		-H 'Content-Type: application/json' -d '{"profile":"good"}' >/dev/null || \
		{ echo "Backend not reachable yet — see prompts/backend/01_01_orchestrator_api.md"; exit 1; }
	@curl -fsS -m 5 -X POST "http://localhost:$(API_PORT)/api/agents/agent-a/tasks" \
		-H 'Content-Type: application/json' \
		-d '{"goal":"Order processing appears to be failing. Investigate the problem and restore normal operation."}'
