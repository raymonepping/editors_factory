import { Router } from "express";
import * as state from "../state.js";
import { effectiveAuthorityFor } from "../policy.js";

export const authorityRouter = Router();

/** Introspection: current effective authority for every known actor,
 * under the active profile. Used by the frontend's authority panel
 * (prompts/frontend/01_01_factory_dashboard_ui.md). */
authorityRouter.get("/authority", (req, res) => {
  const profile = state.getProfile();
  const actors = ["agent-a", "agent-b", "agent-c", "agent-d"];
  res.json({
    profile,
    authority: Object.fromEntries(
      actors.map((a) => [a, effectiveAuthorityFor(a, profile)]),
    ),
  });
});
