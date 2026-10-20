/**
 * Collaboration room links.
 *
 * A room is the whole address of a session: `voo.run/r/XXXXXXXX`. The id is
 * generated on the sharing side and never registered anywhere first — the
 * signalling server learns about a room when someone joins it, which is what
 * keeps sharing instant and the server stateless between sessions.
 *
 * New ids use 20 characters from an unambiguous alphabet. Legacy 8-character
 * ids remain valid so existing shared links keep working. The alphabet has no
 * `0/O` or `1/I/l`, because these get read off screens and retyped.
 */

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
// A bound link is a stable identity for the workflow, not a throwaway session
// id, so it needs to be long enough to stay unguessable across the workflow's
// lifetime (and to never collide with another workflow's id). 20 chars over a
// 31-symbol alphabet ≈ 99 bits — safe against guessing, short enough to share.
const ID_LENGTH = 20;
const ROOM_PATH = "/r/";

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

export function isValidRoomId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** Where a link points when this build is not itself served over the web. */
export const CANONICAL_ORIGIN = "https://voo.run";

/**
 * The shareable link for a room.
 *
 * A link is for someone else, so it can only ever be an http(s) address. The
 * desktop app serves its canvas from `voo://app` and the extension from
 * `chrome-extension://…` — sharing either would hand the other person a URL
 * that only opens on the machine it came from, which is the one thing a share
 * link must never be. Those fall back to voo.run; a build served over http
 * (localhost during development, or voo.run itself) keeps its own origin so
 * the link works where it was made.
 *
 * `access` encodes the room's permission on the link (`?access=view` for a
 * read-only share) so the recipient knows immediately; the guest also adopts
 * the host's choice from the session hello, so a deep link without the query
 * still lands on the right permission.
 *
 * @param {string} roomId
 * @param {string} [origin] overrides the detected one, for tests.
 * @param {string} [access] "view" appends the read-only marker; "edit"/undefined leave it off.
 */
export function roomUrl(roomId, origin, access) {
  const detected = origin ?? globalThis.location?.origin ?? "";
  const shareable = /^https?:\/\//i.test(detected)
    ? detected
    : CANONICAL_ORIGIN;
  const base = `${shareable.replace(/\/+$/, "")}${ROOM_PATH}${roomId}`;
  return access === "view" ? `${base}?access=view` : base;
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
  // Two shapes, because two things produce them: `/r/<id>` is the link people
  // share, and `?r=<id>` is what the landing page falls back to when the
  // desktop app did not take the deep link — the editor lives under /editor/,
  // so it cannot keep the room in its path.
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
