# Ollama runtime

`factory-ollama` is the single local reasoning service shared by Agents A,
B, C, and D. Containers on `factory-control` reach it at
`http://factory-ollama:11434` and from the host at
`http://127.0.0.1:11434`.

## Model choice

The default is `qwen3:4b-instruct` (Q4_K_M, approximately 2.5 GB on disk).
The Qwen3 model family supports Ollama tool calling, and its 4B instruct
variant provides a practical balance for repeated Apple Silicon demos:
structured tool selection and multi-turn instruction following without the
memory and startup cost of the 8B-and-larger variants. The explicit tag also
avoids silently following the larger `latest` alias.

This model serves two workloads:

- Agents A, B, and C run structured observe/reason/tool/result loops.
- Agent D correlates selected security events after deterministic rules have
  detected a transition; it does not continuously spend inference tokens.

The later agent-runtime prompt must read `OLLAMA_MODEL` from the environment.
Agent identity modules must not hard-code a model name.

## Lifecycle

```bash
make ollama-up
make ollama-logs
make ollama-down
```

`make ollama-up` creates the service and runs `scripts/ollama-pull.sh`. The
script waits for `GET /api/tags`, checks whether the exact configured model is
already present, and pulls it only when needed. Models persist in the named
volume `factory-ollama_data`.

Change models by setting one value in `.env`:

```text
OLLAMA_MODEL=qwen3:4b-instruct
```

Running `make ollama-up` again is safe and idempotent.

## API contract

The shared contract for all four agents is:

```text
Base URL (container network): http://factory-ollama:11434
Readiness/model inventory:   GET /api/tags
Structured conversations:    POST /api/chat
Configured model:            ${OLLAMA_MODEL}
```

The service listens only on the host's localhost interface. Agent containers use the shared
`factory-control` network and never call a cloud model provider.

The official image contains the Ollama client but not `curl`. Its container
health check uses `ollama list`, which exercises the same local
`/api/tags` operation. Host-side validation uses `curl` and `jq` against the
published endpoint.
