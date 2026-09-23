// src/tracing.js — v2 (prompts/v2/02_09, Phase 3): minimal, local-only
// spans across the v2 DAG attempt lifecycle. This is observability, not
// a security control — it never touches security/ docs and it is not
// part of the evidence model in audit.js (findings, authority decisions,
// credential events, database changes stay exactly what they were).
//
// Deliberately narrow, per 02_09's own non-goals: no new compose
// service, no external collector, no auto-instrumentation packages for
// Express/pg. A ConsoleSpanExporter is genuinely sufficient for this
// pass — every other piece of this project's own runtime state is
// already inspected the same way (`podman logs factory-api`,
// troubleshooting.md's own `| grep '[db]'` pattern). If a human wants a
// real trace viewer later, point an OTLP collector at this process
// instead of extending this file; that is a bigger, separate decision
// this pass does not make.
//
// Does not forge the app's own traceId (audit.js's UUID) into OTel's own
// 16-byte trace-id slot — a UUID's hex digits are the right length, but
// doing that correctly means minting a non-recording parent SpanContext
// and threading it through every span, and this project's own DAG
// lifecycle events (claim, heartbeat, complete, fail, retry, revoke)
// happen in separate HTTP requests with no live parent context to carry
// forward between them anyway. The practical middle ground: every span
// below carries the app's traceId as a plain attribute
// (`factory.trace_id`), which is enough to correlate a span against the
// same evidence rows audit.js already writes, without the added
// complexity of forged span contexts this pass doesn't need.

import { NodeTracerProvider, ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { trace } from "@opentelemetry/api";

let started = false;

export function startTracing() {
  if (started) return;
  started = true;
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": "factory-api" }),
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  });
  provider.register();
}

export const tracer = trace.getTracer("factory-dag");

/**
 * Wraps one DAG-lifecycle async function body in its own standalone
 * span. Not nested under a live parent (see module comment) — each call
 * gets its own span, correlated by the `factory.*` attributes rather
 * than OTel's own parent/child mechanism. `fn` receives the live span so
 * it can attach attributes only known partway through (e.g. claimNode
 * doesn't know which node it claimed until its own query returns).
 */
export async function withDagSpan(name, attributes, fn) {
  const span = tracer.startSpan(name, { attributes });
  try {
    const result = await fn(span);
    span.setStatus({ code: 1 }); // OK
    return result;
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: 2, message: err.message }); // ERROR
    throw err;
  } finally {
    span.end();
  }
}
