/**
 * The one page origin allowed to drive the desktop app's loopback services.
 *
 * The hosted editor is the app's second home: the same bundle runs at
 * https://voo.run/editor/ and at http://127.0.0.1:<port>/editor/. The loopback
 * copy reaches the app because it *is* the app's own page; the hosted copy has
 * to be let in explicitly, and this constant is the single place that decides
 * which origin that is. Both the panel server (the app's canvas RPC and
 * provider credentials) and the CLI bridge read it, so the two cannot drift
 * apart.
 *
 * Exact match only. `loopback_guard.isAllowedOrigin` is Set membership and
 * stays that way: no wildcard, no `*.voo.run`, no loopback alias, no
 * scheme-less form. A wildcard would hand every subdomain — including any a
 * takeover or a stray staging host could claim — the same reach into the
 * user's machine, and the weakness would be invisible at the call site.
 *
 * The Origin header is supplied by the client. The browser sets it for a page
 * fetch or WebSocket handshake and a page cannot forge it, but a non-browser
 * local process can put anything there. Treat it as a barrier against *web*
 * origins only; it is not authentication.
 *
 * Pure data — no Node, no DOM — so Electron modules and browser code can both
 * import it.
 */

/** Exact origin of the hosted web editor. */
export const HOSTED_EDITOR_ORIGIN = "https://voo.run";
