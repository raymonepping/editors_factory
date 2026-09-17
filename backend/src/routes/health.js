import { Router } from "express";
import { getPool, getPoolCredentialInfo } from "../db.js";
import { vaultHealthCheck } from "../vault.js";

export const healthRouter = Router();

healthRouter.get("/health", async (req, res) => {
  const vault = await vaultHealthCheck();
  let db = { ok: false };
  try {
    await getPool().query("SELECT 1");
    db = { ok: true, credential: getPoolCredentialInfo() };
  } catch (err) {
    db = { ok: false, error: err.message };
  }
  const status = vault.ok && db.ok ? 200 : 503;
  res
    .status(status)
    .json({ status: status === 200 ? "ok" : "degraded", vault, db });
});
