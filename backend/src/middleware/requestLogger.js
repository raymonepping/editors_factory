// src/middleware/requestLogger.js — one structured line per request.

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      `${req.method} ${req.path} ${res.statusCode} ${ms}ms actor=${req.actorId || "-"}`,
    );
  });
  next();
}
