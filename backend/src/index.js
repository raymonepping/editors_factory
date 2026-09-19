import express from "express";
import { validateConfigOnBoot, config } from "./config.js";
import { initDbPool } from "./db.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter, requireHumanSession } from "./auth/index.js";
import { cleanupRunCredentials } from "./services/revocation.js";
import { healthRouter } from "./routes/health.js";
import { agentTokenRouter } from "./routes/agentToken.js";
import { tasksRouter } from "./routes/tasks.js";
import { delegationsRouter } from "./routes/delegations.js";
import { authorityRouter } from "./routes/authority.js";
import { credentialsRouter } from "./routes/credentials.js";
import { actionsRouter } from "./routes/actions.js";
import { eventsRouter } from "./routes/events.js";
import { demoRouter } from "./routes/demo.js";
import { factoryStateRouter } from "./routes/factoryState.js";
import { factoryRecordsRouter } from "./routes/factoryRecords.js";
import * as audit from "./audit.js";
import * as state from "./state.js";

validateConfigOnBoot();

const app = express();
app.use(express.json());
app.use(requestLogger);

// CORS for browser requests
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Cookie",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Auth router (OIDC Login / Callback / Me / Logout)
app.use("/api/v1/auth", authRouter);

// Domain and API routes
app.use("/api", healthRouter);
app.use("/api/v1", agentTokenRouter);
app.use("/api", tasksRouter);
app.use("/api", delegationsRouter);
app.use("/api", authorityRouter);
app.use("/api", credentialsRouter);
app.use("/api/actions", actionsRouter);
app.use("/tools", actionsRouter); // alias, per prompts/api/01_01_factory_schema_and_tools.md
app.use("/api", eventsRouter);
app.use("/api", demoRouter);
app.use("/api", factoryStateRouter);
app.use("/api", factoryRecordsRouter);

app.use(errorHandler);

async function main() {
  await initDbPool();
  console.log("[factory-api] database pool ready (factory-backend-role)");

  const existingRun = await audit.getActiveRun();
  if (existingRun) {
    // Wave 2: Startup discovers an active run from previous container lifecycle —
    // clean up any abandoned Vault leases before resuming
    console.log(
      `[factory-api] recovered active run ${existingRun.run_id}, cleaning up abandoned leases...`,
    );
    await cleanupRunCredentials(existingRun.run_id, "startup_recovery");
    state.setCurrentRunId(existingRun.run_id);
    state.setProfile(existingRun.profile);
  } else {
    const runId = await audit.startRun(state.getProfile());
    state.setCurrentRunId(runId);
  }

  app.listen(config.port, () => {
    console.log(
      `[factory-api] listening on :${config.port}, profile=${state.getProfile()}, authEnabled=${config.auth.enabled}`,
    );
  });
}

main().catch((err) => {
  console.error("[factory-api] fatal startup error:", err);
  process.exit(1);
});
