// src/routes/factoryRecords.js — paginated raw order records for the
// dashboard's "Recent records" panel (prompts/frontend/01_01's own
// Factory State region shows only aggregate counters; this is the first
// place the dashboard shows individual rows). Public, unauthenticated,
// matching routes/events.js's and routes/factoryState.js's own "dashboard
// telemetry, not an agent tool call" pattern.

import { Router } from "express";
import { getPool } from "../db.js";

export const factoryRecordsRouter = Router();

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

factoryRecordsRouter.get("/factory-records", async (req, res, next) => {
  try {
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const pool = getPool();

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT id, customer_ref, status, created_at, updated_at
           FROM orders
          ORDER BY created_at DESC, id DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      pool.query(`SELECT count(*) AS total FROM orders`),
    ]);

    res.json({
      records: rows,
      total: Number(countRows[0].total),
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});
