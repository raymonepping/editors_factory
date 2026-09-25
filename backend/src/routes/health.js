import { Router } from "express";
import {
  getPoolCredentialInfo,
  renewNow,
  verifyCredentialFresh,
} from "../db.js";
import { vaultHealthCheck } from "../vault.js";

export const healthRouter = Router();

healthRouter.get("/health", async (req, res) => {
  const vault = await vaultHealthCheck();
  let db = { ok: false };
  try {
    // prompts/hardening/02_00: a fresh, never-pooled connection, not
    // getPool().query() — the pool can report success on an already-open
    // connection even after the credential backing it has been revoked.
    await verifyCredentialFresh();
    db = { ok: true, credential: getPoolCredentialInfo() };
  } catch (err) {
    db = { ok: false, error: err.message };
    // Self-healing, not just self-reporting (docs/troubleshooting.md's
    // previously unestablished "backend database authentication failed
    // twice after a long run" defect — `podman restart factory-api` was
    // the only known fix). Fire-and-forget: this request still answers
    // promptly with the failure it just observed; renewNow() logs its
    // own outcome, and a healthy pool (or a clear diagnostic if it isn't
    // recoverable) is what the *next* health check — 15s later per this
    // container's own healthcheck interval — will find.
    renewNow("health-check-recovery").catch(() => {});
  }
  const status = vault.ok && db.ok ? 200 : 503;
  res
    .status(status)
    .json({ status: status === 200 ? "ok" : "degraded", vault, db });
});
