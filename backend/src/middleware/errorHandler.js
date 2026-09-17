// src/middleware/errorHandler.js — global Express error handler.
// Never leaks a Vault token, DB password, or raw stack trace to the
// client (security/threat-model.md's secrets-hygiene rules).

export function errorHandler(err, req, res, _next) {
  console.error(`[error] ${req.method} ${req.path}:`, err.message);
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: err.publicMessage || 'Internal error' });
}
