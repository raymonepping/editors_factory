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
import { factoryStateRouter } from "./routes/factoryState.js";
import * as audit from "./audit.js";
import * as state from "./state.js";

validateConfigOnBoot();

const app = express();
app.use(express.json());
app.use(requestLogger);

// CORS — added for prompts/frontend/01_01_factory_dashboard_ui.md: that
// prompt's own design explicitly has the BROWSER connect directly to
// factory-api's published port for its SSE stream (compose/ui/compose.yaml's
// own deliverable text: "via a published port for the browser's own SSE
// connection"), not through a server-side proxy. The Nuxt dev/prod server
// and factory-api run on different ports on localhost, which the browser
// treats as different origins. No cookies/session/credentials are ever
// involved (this UI has no login — prompts/frontend/01_01's own non-goal),
// so a permissive GET/POST/PUT policy with no credentials mode is the
// simplest correct fit for a local, single-operator demo tool — every
// endpoint the UI calls is either already public or was made public
// specifically for dashboard consumption (routes/events.js, routes/
// factoryState.js), never an agent-authenticated tool-call route.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use("/api", healthRouter);
app.use("/api", tasksRouter);
app.use("/api", delegationsRouter);
app.use("/api", authorityRouter);
app.use("/api", credentialsRouter);
app.use("/api/actions", actionsRouter);
app.use("/tools", actionsRouter); // alias, per prompts/api/01_01_factory_schema_and_tools.md
app.use("/api", eventsRouter);
app.use("/api", demoRouter);
app.use("/api", factoryStateRouter);

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
