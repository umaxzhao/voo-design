/**
 * Collaboration room links.
 *
 * A room is the whole address of a session: `voo.run/editor/?r=XXXXXXXX`. The id is
 * generated on the sharing side and never registered anywhere first — the
 * signalling server learns about a room when someone joins it, which is what
 * keeps sharing instant and the server stateless between sessions.
 *
 * New ids use 20 characters from an unambiguous alphabet. Legacy 8-character
 * ids remain valid so existing shared links keep working. The alphabet has no
 * `0/O` or `1/I/l`, because these get read off screens and retyped.
 */

import { VOO_RUN_ORIGIN } from "../../shared/vps_origin.js";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
// A bound link is a stable identity for the workflow, not a throwaway session
// id, so it needs to be long enough to stay unguessable across the workflow's
// lifetime (and to never collide with another workflow's id). 20 chars over a
// 31-symbol alphabet ≈ 99 bits — safe against guessing, short enough to share.
const ID_LENGTH = 20;
const ROOM_PATH = "/r/";
const ROOM_SECRET_BYTES = 16;
const ROOM_SECRET_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Anything that is our id shape (8 to 20 chars), anchored so a URL never matches. */
const ID_PATTERN = new RegExp(`^[${ALPHABET}]{8,20}$`);

/** Rejection-sampled id over the shared alphabet. */
function randomId(length) {
  const out = [];
  const buffer = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (out.length >= length) break;
      // 248 is the largest multiple of 31 below 256; above it, resample.
      if (byte >= 248) continue;
      out.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return out.join("");
}

/**
 * A fresh room id.
 *
 * Rejection sampling rather than `% ALPHABET.length`: the modulo of a byte by
 * 31 favours the first few characters, and a biased id is a smaller id space
 * than it looks.
 */
export function createRoomId() {
  return randomId(ID_LENGTH);
}

/** A 128-bit room secret encoded without padding for use in a URL fragment. */
export function createRoomSecret() {
  const bytes = new Uint8Array(ROOM_SECRET_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    encoded += BASE64URL_ALPHABET[first >> 2];
    encoded += BASE64URL_ALPHABET[((first & 3) << 4) | (second >> 4)];
    if (index + 1 < bytes.length) {
      encoded += BASE64URL_ALPHABET[((second & 15) << 2) | (third >> 6)];
    }
    if (index + 2 < bytes.length) encoded += BASE64URL_ALPHABET[third & 63];
  }
  return encoded;
}

export function isValidRoomId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** The public app origin shared by browser, desktop and preview builds. */
export const CANONICAL_ORIGIN = VOO_RUN_ORIGIN;

/**
 * The shareable link always opens the published app, never a private host.
 * Local, desktop, extension and preview origins are implementation details
 * that recipients cannot necessarily reach.
 *
 * `access` encodes the room's permission on the link (`?access=view` for a
 * read-only share) so the recipient knows immediately; the guest also adopts
 * the host's choice from the session hello, so a deep link without the query
 * still lands on the right permission.
 *
 * @param {string} roomId
 * @param {string} [_origin] Legacy argument retained for call compatibility; ignored.
 * @param {string} [access] "view" appends the read-only marker; "edit"/undefined leave it off.
 * @param {string} [secret] A URL-fragment room secret, never sent in HTTP requests.
 */
export function roomUrl(roomId, _origin, access, secret) {
  const base = `${CANONICAL_ORIGIN}/editor/?r=${roomId}`;
  const withAccess = access === "view" ? `${base}&access=view` : base;
  return secret && ROOM_SECRET_PATTERN.test(secret)
    ? `${withAccess}#k=${secret}`
    : withAccess;
}

/** The 128-bit secret in a room link fragment, or null if absent or invalid. */
export function roomSecretFromLink(input) {
  if (typeof input !== "string") return null;
  try {
    const secret = new URL(input, CANONICAL_ORIGIN).hash
      .slice(1)
      .split("&")
      .map((part) => part.split("=", 2))
      .find(([key]) => key === "k")?.[1];
    return secret && ROOM_SECRET_PATTERN.test(secret) ? secret : null;
  } catch {
    return null;
  }
}

/** The room secret from the current page URL fragment, if present. */
export function roomSecretFromLocation(location = globalThis.location) {
  return location ? roomSecretFromLink(location.href ?? location.hash ?? "") : null;
}

/** The permission read from the current link, or null when none is marked. */
export function accessFromLocation(location = globalThis.location) {
  try {
    const access = new URLSearchParams(location.search ?? "").get("access");
    return access === "view" ? "view" : access === "edit" ? "edit" : null;
  } catch {
    return null;
  }
}

/** The permission carried in a pasted link (URL or bare text), or null. */
export function accessFromLink(text) {
  if (typeof text !== "string") return null;
  try {
    const access = new URL(text, CANONICAL_ORIGIN).searchParams.get("access");
    return access === "view" ? "view" : access === "edit" ? "edit" : null;
  } catch {
    return null;
  }
}

/**
 * The room id in a link, or null.
 *
 * Accepts a bare id as well as a full URL, because people paste both — and a
 * link that arrived through a chat app often carries tracking parameters or a
 * trailing slash it did not leave with.
 */
export function parseRoomId(input) {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text) return null;
  if (isValidRoomId(text)) return text;

  // Public editor links carry their room in the query; legacy /r/ paths remain valid.
  try {
    const url = new URL(text, CANONICAL_ORIGIN);
    const queryRoom = url.searchParams.get("r") ?? url.searchParams.get("room");
    if (queryRoom && isValidRoomId(queryRoom.trim())) return queryRoom.trim();
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    // Malformed URLs may still be legacy room paths handled below.
  }

  // `voo://r/abcdefgh` is the deep link the desktop app is launched with. The
  // OS may hand back the id as the host or as the path depending on platform,
  // so the scheme is stripped and what is left read as a path either way.
  let path = text.replace(/^voo:\/\//i, "/");
  try {
    path = new URL(path).pathname;
  } catch {
    // Not a URL: read it as a path, so "/r/abcdefgh" works too.
  }
  const index = path.lastIndexOf(ROOM_PATH);
  if (index === -1) return null;
  const candidate = path.slice(index + ROOM_PATH.length).replace(/\/+$/, "");
  return isValidRoomId(candidate) ? candidate : null;
}

/** The deep link that hands a room to the installed desktop app. */
export function deepLinkUrl(roomId) {
  return `voo://r/${roomId}`;
}

/** The room this page was opened into, or null for an ordinary editor load. */
export function roomIdFromLocation(location = globalThis.location) {
  if (!location) return null;
  // Current public links open /editor/?r=<id>; retain legacy /r/<id> paths
  // and the desktop deep-link handoff for existing invitations.
  const fromPath = parseRoomId(location.pathname ?? "");
  if (fromPath) return fromPath;
  try {
    return parseRoomId(
      new URLSearchParams(location.search ?? "").get("r") ?? "",
    );
  } catch {
    return null;
  }
}
