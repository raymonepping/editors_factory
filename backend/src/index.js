import express from "express";
import { validateConfigOnBoot, config } from "./config.js";
import { initDbPool } from "./db.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { tasksRouter } from "./routes/tasks.js";
import { delegationsRouter } from "./routes/delegations.js";
import { authorityRouter } from "./routes/authority.js";
import { credentialsRouter } from "./routes/credentials.js";
import { actionsRouter } from "./routes/actions.js";
import { eventsRouter } from "./routes/events.js";
import { demoRouter } from "./routes/demo.js";
import * as audit from "./audit.js";
import * as state from "./state.js";

validateConfigOnBoot();

const app = express();
app.use(express.json());
app.use(requestLogger);

app.use("/api", healthRouter);
app.use("/api", tasksRouter);
app.use("/api", delegationsRouter);
app.use("/api", authorityRouter);
app.use("/api", credentialsRouter);
app.use("/api/actions", actionsRouter);
app.use("/tools", actionsRouter); // alias, per prompts/api/01_01_factory_schema_and_tools.md
app.use("/api", eventsRouter);
app.use("/api", demoRouter);

app.use(errorHandler);

async function main() {
  await initDbPool();
  console.log("[factory-api] database pool ready (factory-backend-role)");

  const existingRun = await audit.getActiveRun();
  if (existingRun) {
    state.setCurrentRunId(existingRun.run_id);
    state.setProfile(existingRun.profile);
  } else {
    const runId = await audit.startRun(state.getProfile());
    state.setCurrentRunId(runId);
  }

  app.listen(config.port, () => {
    console.log(
      `[factory-api] listening on :${config.port}, profile=${state.getProfile()}`,
    );
  });
}

main().catch((err) => {
  console.error("[factory-api] fatal startup error:", err);
  process.exit(1);
});
