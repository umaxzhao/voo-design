/**
 * The wire format between collaborating peers.
 *
 * Two channels carry these: the signalling socket, which only ever sees the
 * handshake messages, and the peer-to-peer data channel, which carries
 * everything else. Keeping one vocabulary for both means a message can be
 * logged, tested and reasoned about without knowing which pipe it came down.
 *
 * Every message is JSON with a `t` (type) and a `v` (protocol version). The
 * version travels on each message rather than being agreed once at connect,
 * so a peer running an older build can be told precisely which message it did
 * not understand instead of the session simply going quiet.
 *
 * The one exception is bulk image bytes: those travel as binary frames whose
 * small JSON header carries the same `t`/`v` vocabulary (see chunking.js), so
 * the frames stay self-describing without paying base64's 33% on the wire.
 */

export const PROTOCOL_VERSION = 1;

/**
 * An optional feature a peer advertises in its HELLO. A peer whose HELLO
 * names no capabilities gets the original wire format, so a shared link keeps
 * working — documents and all — when one side runs an older build.
 */
export const CAP_BINARY_BLOBS = "blobBin";

export const MSG = {
  /* --- signalling: only these three reach the server ------------------- */
  /** Joining a room; the server answers with ROSTER. */
  JOIN: "join",
  /** Who else is in the room, sent by the server to the joiner. */
  ROSTER: "roster",
  /** An opaque WebRTC offer/answer/candidate, relayed verbatim. */
  SIGNAL: "signal",

  /* --- peer to peer ----------------------------------------------------- */
  /** Introduces a peer: display name, colour, and what it is looking at. */
  HELLO: "hello",
  /** A peer's live cursor, throttled by the sender. */
  CURSOR: "cursor",
  /** A whole workflow document, for the merge on the other side. */
  DOC: "doc",
  /** Asks for the current document, sent by a peer that just joined. */
  DOC_REQUEST: "docRequest",
  /** The image ids the sender holds, so the receiver can spot what it lacks. */
  BLOB_HAVE: "blobHave",
  /** The image ids the sender is missing. */
  BLOB_WANT: "blobWant",
  /** The image ids a peer wants at full resolution (an editor opened one). */
  BLOB_WANT_ORIGINAL: "blobWantOriginal",
  /** One image, as a data URL. */
  BLOB_DATA: "blobData",
  /** A finished mask/brush stroke, replayed rather than shipped as pixels. */
  STROKE: "stroke",
  /** A saved subgraph pipeline template, shared to the room (plan P3-3). */
  SUBGRAPH_TEMPLATE: "subgraphTemplate",
  /** A peer is leaving; sent best-effort before the channel closes. */
  BYE: "bye",
};

const TYPES = new Set(Object.values(MSG));

/** Raised for anything that arrives malformed, so callers can log one shape. */
export class ProtocolError extends Error {
  constructor(reason, detail) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "ProtocolError";
    this.reason = reason;
  }
}

/**
 * Required fields per type.
 *
 * Validation is deliberately shallow — presence and primitive type only. A
 * peer is not a trusted client, but it is also not the place to re-validate a
 * whole document: the merge downstream already copes with whatever it is
 * handed, and duplicating its rules here would only let the two drift apart.
 */
const REQUIRED = {
  [MSG.JOIN]: { room: "string", peerId: "string" },
  [MSG.ROSTER]: { peers: "object" },
  [MSG.SIGNAL]: { to: "string", from: "string", data: "object" },
  [MSG.HELLO]: { peerId: "string", name: "string", colour: "string" },
  // `avatar` is optional: a peer on an older build simply shows initials.
  [MSG.CURSOR]: { peerId: "string" },
  [MSG.DOC]: { document: "object" },
  [MSG.DOC_REQUEST]: {},
  [MSG.BLOB_HAVE]: { ids: "object" },
  [MSG.BLOB_WANT]: { ids: "object" },
  [MSG.BLOB_WANT_ORIGINAL]: { ids: "object" },
  [MSG.BLOB_DATA]: { id: "string", dataUrl: "string" },
  [MSG.STROKE]: { nodeId: "string", points: "object" },
  [MSG.SUBGRAPH_TEMPLATE]: { peerId: "string", template: "object" },
  [MSG.BYE]: { peerId: "string" },
};

/** Builds a message. Throws rather than putting a malformed one on the wire. */
export function encode(type, payload = {}) {
  if (!TYPES.has(type)) throw new ProtocolError("unknownType", type);
  const required = REQUIRED[type] ?? {};
  for (const [field, kind] of Object.entries(required)) {
    // typeof null is "object", and every "object" field here is an array or a
    // record — neither of which may be null.
    const value = payload[field];
    if (value === null || value === undefined || typeof value !== kind) {
      throw new ProtocolError("missingField", `${type}.${field}`);
    }
  }
  return JSON.stringify({ ...payload, t: type, v: PROTOCOL_VERSION });
}

/**
 * Parses a message off either channel.
 *
 * @returns {{type: string, ...}} the payload with `type` spelled out.
 * @throws {ProtocolError} on anything unparseable, unknown, from a future
 *   protocol, or missing a field the type requires.
 */
export function decode(raw) {
  let parsed;
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : String(raw));
  } catch {
    throw new ProtocolError("notJson");
  }
  if (!parsed || typeof parsed !== "object")
    throw new ProtocolError("notObject");
  const { t: type, v: version, ...payload } = parsed;
  if (!TYPES.has(type)) throw new ProtocolError("unknownType", String(type));
  if (version !== PROTOCOL_VERSION) {
    throw new ProtocolError("versionMismatch", `saw ${version}`);
  }
  const required = REQUIRED[type] ?? {};
  for (const [field, kind] of Object.entries(required)) {
    const value = payload[field];
    if (value === null || value === undefined || typeof value !== kind) {
      throw new ProtocolError("missingField", `${type}.${field}`);
    }
  }
  return { type, ...payload };
}
