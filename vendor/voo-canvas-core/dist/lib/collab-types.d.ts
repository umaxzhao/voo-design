/** Bumped when message shape changes incompatibly. Old clients should refuse
 *  to drive the canvas if `serverProtocolVersion > CLIENT_PROTOCOL_VERSION`. */
export declare const CLIENT_PROTOCOL_VERSION = 1;
/** Color palette for peer avatars + remote cursors. Picked at peer-join time
 *  so each room slot stays visually stable across reconnects. */
export declare const PEER_PALETTE: readonly ["#E55934", "#3A86FF", "#06A77D", "#F0A202", "#9B5DE5", "#F15BB5", "#00BBF9"];
/** Cursor move events are throttled to this interval (ms). 33ms ≈ 30fps which
 *  is the empirical floor where remote cursors feel "live" without flooding
 *  the wire on a fast-moving local pointer. */
export declare const CURSOR_THROTTLE_MS = 33;
/** Object-mutation events use the same throttle window — fast typing into a
 *  text node otherwise generates 60+ messages/second per character. */
export declare const OBJ_UPDATE_THROTTLE_MS = 33;
/** Reconnect exponential backoff bounds (ms). The hook starts at BASE and
 *  doubles each retry until it reaches MAX. */
export declare const RECONNECT_BASE_MS = 1000;
export declare const RECONNECT_MAX_MS = 15000;
export interface PeerCursor {
    x: number;
    y: number;
}
export interface PeerInfo {
    peerId: string;
    name: string;
    color: string;
    role?: "editor" | "viewer";
    cursor?: PeerCursor;
    /** Object IDs currently selected by this peer. */
    selection?: string[];
    /** Object ID currently being dragged / edited by this peer, or null when
     *  not actively locking anything. */
    lockedObjId?: string | null;
}
/** Connection lifecycle states surfaced to the UI status dot. */
export type CollabStatus = "idle" | "connecting" | "open" | "closed";
/** Server → client message envelope. Discriminated by `type`. */
export interface CollabSnapshotMsg {
    type: "snapshot";
    peers: PeerInfo[];
    protocolVersion?: number;
}
export interface CollabPeerJoinMsg {
    type: "peer:join";
    peer: PeerInfo;
}
export interface CollabPeerLeaveMsg {
    type: "peer:leave";
    peerId: string;
}
export interface CollabPeerCursorMsg {
    type: "peer:cursor";
    peerId: string;
    x: number;
    y: number;
}
export interface CollabPeerSelectMsg {
    type: "peer:select";
    peerId: string;
    ids: string[];
}
export interface CollabPeerLockMsg {
    type: "peer:lock";
    peerId: string;
    objId: string | null;
}
export interface CollabPeerObjUpdateMsg {
    type: "peer:obj:update";
    peerId: string;
    objId: string;
    patch: Record<string, unknown>;
    seq?: number;
}
export interface CollabPeerObjCreateMsg {
    type: "peer:obj:create";
    peerId: string;
    object: Record<string, unknown>;
}
export interface CollabPeerObjDeleteMsg {
    type: "peer:obj:delete";
    peerId: string;
    objId: string;
}
export interface CollabPingMsg {
    type: "ping";
}
/** Canvas state snapshot payload — exchanged when a peer joins an in-
 *  progress room so they catch up on unsaved changes other peers haven't
 *  yet autosaved to the DB. Kept as opaque object arrays so the protocol
 *  layer doesn't need to know about node / frame / connection shapes.
 *
 *  Chip #4 slices (components / componentInstances / variables /
 *  variableCollections) are OPTIONAL so older peers running pre-chip-#4
 *  builds don't error when joining — they just send/receive these as
 *  undefined and the receiver falls back to []. Once the room rolls
 *  over to chip-#4 builds everywhere, these become de-facto required. */
export interface CollabStatePayload {
    nodes: Array<Record<string, unknown>>;
    frames: Array<Record<string, unknown>>;
    connections: Array<Record<string, unknown>>;
    components?: Array<Record<string, unknown>>;
    componentInstances?: Array<Record<string, unknown>>;
    pages?: Array<Record<string, unknown>>;
    activePageId?: string;
    variables?: Array<Record<string, unknown>>;
    variableCollections?: Array<Record<string, unknown>>;
}
export interface CollabPeerStateRequestMsg {
    type: "peer:state:request";
    /** Peer who is asking for the snapshot — receivers should reply with
     *  state:response carrying `to: peerId`. */
    peerId: string;
}
export interface CollabPeerStateResponseMsg {
    type: "peer:state:response";
    /** Peer who sent the snapshot. Useful for tracing; not required to
     *  apply. */
    peerId: string;
    state: CollabStatePayload;
}
export type CollabServerMsg = CollabSnapshotMsg | CollabPeerJoinMsg | CollabPeerLeaveMsg | CollabPeerCursorMsg | CollabPeerSelectMsg | CollabPeerLockMsg | CollabPeerObjUpdateMsg | CollabPeerObjCreateMsg | CollabPeerObjDeleteMsg | CollabPeerStateRequestMsg | CollabPeerStateResponseMsg | CollabPingMsg;
/** Client → server upstream message vocabulary (sent via POST in the SSE
 *  transport, or WS frame in a future ws-based variant). */
export interface CollabHelloMsg {
    type: "hello";
    room: string;
    peerId: string;
    name: string;
    color: string;
}
export interface CollabCursorMsg {
    type: "cursor";
    x: number;
    y: number;
}
export interface CollabSelectMsg {
    type: "select";
    ids: string[];
}
export interface CollabLockMsg {
    type: "lock";
    objId: string | null;
}
export interface CollabObjUpdateMsg {
    type: "obj:update";
    objId: string;
    patch: Record<string, unknown>;
    seq?: number;
}
export interface CollabObjCreateMsg {
    type: "obj:create";
    object: Record<string, unknown>;
}
export interface CollabObjDeleteMsg {
    type: "obj:delete";
    objId: string;
}
export interface CollabPongMsg {
    type: "pong";
}
export interface CollabStateRequestMsg {
    type: "state:request";
}
export interface CollabStateResponseMsg {
    type: "state:response";
    /** Recipient peerId — the requester whose state:request triggered this
     *  reply. Server uses this to target the response instead of fanning
     *  out to the whole room. */
    to: string;
    state: CollabStatePayload;
}
export type CollabClientMsg = CollabHelloMsg | CollabCursorMsg | CollabSelectMsg | CollabLockMsg | CollabObjUpdateMsg | CollabObjCreateMsg | CollabObjDeleteMsg | CollabPongMsg | CollabStateRequestMsg | CollabStateResponseMsg;
/** Type guard for server → client messages. Use after JSON.parse and after
 *  sanitizeUntrusted, before dispatching on `type`. */
export declare function isCollabServerMsg(raw: unknown): raw is CollabServerMsg;
/** Pick a palette color deterministically from a peerId hash so the same
 *  user keeps the same color across reconnects within a session. */
export declare function pickPeerColor(peerId: string): string;
/** True when `color` is one of the PEER_PALETTE entries. Peer chrome
 *  (cursor / avatar / selection ring) may only paint palette colors per
 *  DESIGN_SYSTEM §1.3 — anything else a client sends gets normalized. */
export declare function isPaletteColor(color: unknown): color is string;
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
export declare function assignPeerColor(peerId: string, requested: unknown, usedColors: ReadonlySet<string>): string;
/** Validate cursor coords — peers can send NaN/Infinity or non-number garbage
 *  and the renderer would crash on transform: scale(NaN). */
export declare function isValidCursor(c: unknown): c is PeerCursor;
//# sourceMappingURL=collab-types.d.ts.map