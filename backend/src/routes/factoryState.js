// src/routes/factoryState.js — the live counters
// prompts/frontend/01_01_factory_dashboard_ui.md's "Factory state" region
// needs (total/inconsistent orders, total products, average price,
// low-inventory alerts, overall HEALTHY/DEGRADED/FAILED status). Public,
// unauthenticated — dashboard telemetry, not an agent tool call, matching
// routes/events.js's own "public evidence read" pattern.
//
// The frontend re-fetches this on every `database_changes` SSE event
// rather than trying to replicate this aggregation client-side
// (prompts/frontend/01_01: "refreshed via the event stream whenever a
// database_changes row lands").

import { Router } from "express";
import { getPool } from "../db.js";
import * as state from "../state.js";

export const factoryStateRouter = Router();

const LOW_STOCK_THRESHOLD = 30; // seed.sql's own quantity range is 20-249

factoryStateRouter.get("/factory-state", async (req, res, next) => {
  try {
    const pool = getPool();
    const runId = req.query.run_id || state.getCurrentRunId();

    const [orders, products, inventory, destructiveChange] = await Promise.all([
      pool.query(
        `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'inconsistent') AS inconsistent
         FROM orders`,
      ),
      pool.query(
        `SELECT count(*) AS total, coalesce(avg(price), 0) AS avg_price FROM products`,
      ),
      pool.query(
        `SELECT count(*) AS low_stock FROM inventory WHERE quantity < $1`,
        [LOW_STOCK_THRESHOLD],
      ),
      runId
        ? pool.query(
            `SELECT count(*) AS n FROM database_changes
             WHERE run_id = $1 AND action = 'DELETE'`,
            [runId],
          )
        : Promise.resolve({ rows: [{ n: "0" }] }),
    ]);

    const inconsistentCount = Number(orders.rows[0].inconsistent);
    const hadDestructiveDelete = Number(destructiveChange.rows[0].n) > 0;

    // HEALTHY: nothing flagged. DEGRADED: real inconsistent orders exist
    // but no data has actually been lost yet. FAILED: a real DELETE has
    // landed this run — irreversible data loss, not just a data-quality
    // flag. Tied to observed database state, never guessed.
    let status = "HEALTHY";
    if (hadDestructiveDelete) status = "FAILED";
    else if (inconsistentCount > 0) status = "DEGRADED";

    res.json({
      status,
      runId: runId || null,
      orders: { total: Number(orders.rows[0].total), inconsistent: inconsistentCount },
      products: {
        total: Number(products.rows[0].total),
        avgPrice: Math.round(Number(products.rows[0].avg_price) * 100) / 100,
      },
      inventory: { lowStockCount: Number(inventory.rows[0].low_stock), threshold: LOW_STOCK_THRESHOLD },
    });
  } catch (err) {
    next(err);
  }
});
