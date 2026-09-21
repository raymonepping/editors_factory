// auth/authorize.js — Prompt 01.01 (Human AuthZ).
// Roles:
//   - factory-operator (Raymon, Barend) -> Viewer rights + demo controls (start tasks, switch profiles, reset).
//   - factory-viewer   (Claire)         -> View dashboard state, telemetry, events, authority, findings.

const ROLE_GROUPS = {
  "factory-operator": "factory-operator",
  "factory-viewer": "factory-viewer",
};

export const VALID_ROLES = Object.freeze(Object.values(ROLE_GROUPS));

export function groupsToRole(groups = []) {
  if (groups.includes("factory-operator")) return "factory-operator";
  if (groups.includes("factory-viewer")) return "factory-viewer";
  return null;
}

const POLICY = {
  "factory-viewer": {
    read_dashboard: true,
    read_events: true,
    start_task: false,
    switch_profile: false,
    reset_demo: false,
    // prompts/improvements/01_08_agentic_iam_inspired_hardening.md
    // Phase 4: authorizing a supervised (Control-Group-gated)
    // credential request is a demo-control action, same tier as
    // switch_profile/reset_demo — an operator capability, not a
    // viewer one.
    authorize_credential: false,
  },
  "factory-operator": {
    read_dashboard: true,
    read_events: true,
    start_task: true,
    switch_profile: true,
    reset_demo: true,
    authorize_credential: true,
  },
};

export function authorizeAction(role, action) {
  if (!role) return false;
  return Boolean(POLICY[role]?.[action]);
}

export function requireRole(action) {
  return (req, res, next) => {
    // req.identity is always set by requireHumanSession before this runs
    // — including the FACTORY_AUTH_ENABLED=false case, which assigns a
    // real default operator identity rather than leaving it unset (see
    // auth/index.js). A missing identity here means requireHumanSession
    // was skipped or bypassed, not that auth is off — fail closed rather
    // than treat that as permission to proceed (this used to silently
    // permit every request; found live).
    if (!req.identity) {
      return res.status(401).json({ error: "authentication required" });
    }
    const role = req.identity.role;
    if (!authorizeAction(role, action)) {
      return res.status(403).json({
        error: "forbidden",
        action,
        reason: `Role '${role}' is not authorized to perform '${action}'`,
      });
    }
    next();
  };
}
