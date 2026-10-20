/**
 * Who is in the room right now.
 *
 * Presence is deliberately not persisted anywhere: a peer exists while its
 * data channel does. That is the whole model — whoever is online is a server,
 * and when the last peer leaves the session simply stops existing. Nothing
 * here writes to storage, so nothing has to be cleaned up afterwards.
 *
 * The roster drives the avatar stack, so it is ordered stably: yourself first,
 * then everyone else by when they arrived. An avatar that reshuffles whenever
 * someone's cursor moves is unreadable.
 */

/**
 * Avatar colours.
 *
 * Chosen to stay legible as a small filled circle on the dark toolbar and to
 * stay apart from each other for the common case of two or three people —
 * and clear of the app's own green, which already means "this is yours".
 */
export const PEER_COLOURS = [
  "#e5b2ff", // orchid
  "#7fd4a8", // mint
  "#ffb27f", // apricot
  "#7fb8ff", // sky
  "#ff7f9c", // rose
  "#ffd77f", // amber
  "#b8a0ff", // periwinkle
  "#7fe0d4", // aqua
];

/** How long a peer may go silent before the roster drops it. */
export const PEER_TIMEOUT_MS = 20_000;

/**
 * A stable colour for an id.
 *
 * Hashed rather than handed out in join order so a peer keeps the same colour
 * across reconnects — the person who was orchid a minute ago is still orchid,
 * which is what makes the colour worth reading at all.
 */
export function colourFor(peerId) {
  let hash = 0;
  for (let i = 0; i < peerId.length; i += 1) {
    hash = (hash * 31 + peerId.charCodeAt(i)) >>> 0;
  }
  return PEER_COLOURS[hash % PEER_COLOURS.length];
}

/**
 * The one or two characters shown inside an avatar.
 *
 * Latin names give their initials; anything else — CJK in particular, where
 * "initials" are meaningless — gives its first character, which is the part a
 * reader actually recognises.
 */
export function initialsFor(name) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  if (/^[\p{Script=Latin}\p{Nd}\s.'-]+$/u.test(trimmed)) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  return [...trimmed][0];
}

/**
 * The live roster.
 *
 * @param {string} selfId this peer's id, always listed first.
 * @param {() => number} [now] injectable clock, so the timeout is testable.
 */
export function createPresence(selfId, now = () => Date.now()) {
  /** peerId -> { peerId, name, colour, cursor, workflowId, seenAt, self } */
  const peers = new Map();
  let order = 0;
  /** peerId -> arrival index, so the roster keeps a stable order. */
  const arrival = new Map();

  function record(peerId, patch) {
    const existing = peers.get(peerId);
    if (!existing) {
      arrival.set(peerId, order);
      order += 1;
    }
    const next = {
      peerId,
      name: "",
      avatarSeed: null,
      colour: colourFor(peerId),
      cursor: null,
      workflowId: null,
      self: peerId === selfId,
      ...existing,
      ...patch,
      seenAt: now(),
    };
    peers.set(peerId, next);
    return next;
  }

  return {
    /** Adds or updates a peer from its HELLO. */
    upsert(peerId, patch = {}) {
      if (!peerId) return null;
      return record(peerId, patch);
    },

    /** Marks a peer alive without changing anything else. */
    touch(peerId) {
      if (!peers.has(peerId)) return null;
      return record(peerId, {});
    },

    /** Moves a peer's cursor. Unknown peers are ignored, not invented. */
    setCursor(peerId, cursor) {
      if (!peers.has(peerId)) return null;
      return record(peerId, { cursor });
    },

    remove(peerId) {
      peers.delete(peerId);
      arrival.delete(peerId);
    },

    /** Drops peers that have gone quiet; returns the ids it removed. */
    sweep() {
      const cutoff = now() - PEER_TIMEOUT_MS;
      const dropped = [];
      for (const [peerId, peer] of peers) {
        // Silence is how a peer leaves when the tab is closed mid-session:
        // there is no BYE, and nothing else would ever clear it.
        if (!peer.self && peer.seenAt < cutoff) dropped.push(peerId);
      }
      dropped.forEach((peerId) => this.remove(peerId));
      return dropped;
    },

    get(peerId) {
      return peers.get(peerId) ?? null;
    },

    /** Yourself first, then everyone else in the order they arrived. */
    list() {
      return [...peers.values()].sort((left, right) => {
        if (left.self !== right.self) return left.self ? -1 : 1;
        return (
          (arrival.get(left.peerId) ?? 0) - (arrival.get(right.peerId) ?? 0)
        );
      });
    },

    /** How many people are in the room, including you. */
    get size() {
      return peers.size;
    },

    clear() {
      peers.clear();
      arrival.clear();
    },
  };
}
