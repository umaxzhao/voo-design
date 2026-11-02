// Collaboration protocol types & constants.
//
// Adapted from voo-create's src/hooks/use-collab.ts. The transport layer is
// different (voo-canvas uses SSE downstream + REST upstream rather than raw
// WebSocket, see app/api/collab/route.ts) but the message vocabulary stays
// compatible so we can swap transports later without touching the UI.
/** Bumped when message shape changes incompatibly. Old clients should refuse
 *  to drive the canvas if `serverProtocolVersion > CLIENT_PROTOCOL_VERSION`. */
export const CLIENT_PROTOCOL_VERSION = 1;
/** Color palette for peer avatars + remote cursors. Picked at peer-join time
 *  so each room slot stays visually stable across reconnects. */
export const PEER_PALETTE = [
    "#E55934",
    "#3A86FF",
    "#06A77D",
    "#F0A202",
    "#9B5DE5",
    "#F15BB5",
    "#00BBF9",
];
/** Cursor move events are throttled to this interval (ms). 33ms ≈ 30fps which
 *  is the empirical floor where remote cursors feel "live" without flooding
 *  the wire on a fast-moving local pointer. */
export const CURSOR_THROTTLE_MS = 33;
/** Object-mutation events use the same throttle window — fast typing into a
 *  text node otherwise generates 60+ messages/second per character. */
export const OBJ_UPDATE_THROTTLE_MS = 33;
/** Reconnect exponential backoff bounds (ms). The hook starts at BASE and
 *  doubles each retry until it reaches MAX. */
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 15000;
/** Type guard for server → client messages. Use after JSON.parse and after
 *  sanitizeUntrusted, before dispatching on `type`. */
export function isCollabServerMsg(raw) {
    return (typeof raw === "object" &&
        raw !== null &&
        "type" in raw &&
        typeof raw.type === "string");
}
/** Pick a palette color deterministically from a peerId hash so the same
 *  user keeps the same color across reconnects within a session. */
export function pickPeerColor(peerId) {
    let h = 0;
    for (let i = 0; i < peerId.length; i++) {
        h = (h * 31 + peerId.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(h) % PEER_PALETTE.length;
    return PEER_PALETTE[idx];
}
/** True when `color` is one of the PEER_PALETTE entries. Peer chrome
 *  (cursor / avatar / selection ring) may only paint palette colors per
 *  DESIGN_SYSTEM §1.3 — anything else a client sends gets normalized. */
export function isPaletteColor(color) {
    return typeof color === "string" && PEER_PALETTE.includes(color);
}
/** Canonical room color assignment. Peers may *request* a color (their
 *  locally-persisted identity pick), but the room owns the final call so
 *  that:
 *    1. every color in play comes from PEER_PALETTE, and
 *    2. two peers in the same room never share a color while a free slot
 *       remains (≤ PEER_PALETTE.length peers).
 *
 *  Priority: requested color if palette + unused → first unused palette
 *  slot → deterministic pickPeerColor fallback once the palette is
 *  exhausted (collisions unavoidable past that point, but stable). */
export function assignPeerColor(peerId, requested, usedColors) {
    if (isPaletteColor(requested) && !usedColors.has(requested)) {
        return requested;
    }
    for (const color of PEER_PALETTE) {
        if (!usedColors.has(color))
            return color;
    }
    return pickPeerColor(peerId);
}
/** Validate cursor coords — peers can send NaN/Infinity or non-number garbage
 *  and the renderer would crash on transform: scale(NaN). */
export function isValidCursor(c) {
    return (typeof c === "object" &&
        c !== null &&
        Number.isFinite(c.x) &&
        Number.isFinite(c.y));
}
//# sourceMappingURL=collab-types.js.map