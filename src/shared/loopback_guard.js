/**
 * Shared loopback security checks for the local services.
 *
 * Three services bind loopback ports and share one threat model — a local
 * process, or a web page that can reach 127.0.0.1 (WebSockets are not
 * CORS-bound), can talk to them:
 *
 *   - electron/automation_server.js   bearer token            (wired)
 *   - electron/panel_server.js        Origin allowlist        (wired)
 *   - electron/extension_bridge.js    Origin allowlist        (wired)
 *   - scripts/signaling-server.mjs    optional shared secret  (not yet wired)
 *
 * Before this module each service checked (or failed to check) its own way;
 * the gates live here so one implementation guards all three, and so they are
 * unit-testable without Electron.
 *
 * Pure Node — no Electron, no DOM — so the deploy-side signaling server can
 * import it too. Do not import this from browser code: it uses node:crypto.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison; any non-string input is rejected. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** A fresh bearer token: `bytes` random bytes, base64url (24 bytes -> 32 chars). */
export function generateToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

/**
 * The token carried by an `Authorization: Bearer <token>` header, or null.
 * The scheme prefix is part of the check: a bare token is not accepted.
 */
export function bearerToken(headers) {
  const authorization = headers?.authorization;
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return null;
  }
  const token = authorization.slice("Bearer ".length);
  return token.length > 0 ? token : null;
}

/** Whether a request carries the exact bearer token that gates the API. */
export function isAuthorizedRequest(headers, token) {
  if (typeof token !== "string" || token.length === 0) return false;
  const presented = bearerToken(headers);
  return presented !== null && safeEqual(presented, token);
}

/**
 * Whether a page Origin is inside the allowed set (exact match).
 * An empty or missing allowlist rejects everything — safe by default.
 */
export function isAllowedOrigin(origin, allowedOrigins) {
  if (typeof origin !== "string" || origin.length === 0) return false;
  const set =
    allowedOrigins instanceof Set
      ? allowedOrigins
      : new Set(allowedOrigins ?? []);
  return set.has(origin);
}
