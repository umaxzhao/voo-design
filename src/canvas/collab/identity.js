/**
 * Who you appear as to the other people in a room.
 *
 * Identity is per device and deliberately not an account: a name and an avatar
 * seed, kept in this browser's own storage. Collaboration here is a link you
 * pass to someone, so asking them to sign in first would be the heaviest part
 * of the whole feature.
 *
 * The avatar is a DiceBear "dylan" figure derived from a seed rather than an
 * uploaded picture — a seed is a short string that costs nothing to send, and
 * every peer renders the same face from it without anything being stored.
 */

const STORAGE_KEY = "voo.collab.identity";
const DICEBEAR = "https://api.dicebear.com/9.x/dylan/svg";
export const ACCOUNT_AVATAR_COLORS = Object.freeze([
  "b2ccff", // VOO blue
  "a7ffd4", // VOO green
  "e5b2ff", // VOO purple
]);

/** The picture for a seed. Peers exchange the seed, never the image. */
export function avatarUrl(seed, backgroundColor) {
  const encodedSeed = encodeURIComponent(seed ?? "");
  const color = ACCOUNT_AVATAR_COLORS.includes(backgroundColor)
    ? `&backgroundColor=${backgroundColor}`
    : "";
  return `${DICEBEAR}?seed=${encodedSeed}${color}`;
}

/** A fresh seed: short, opaque, and nothing to do with the peer id. */
export function randomSeed() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(36)).join("");
}

/**
 * Reads the saved identity, inventing one on first use.
 *
 * Storage can throw outright in a partitioned or blocked context, and an
 * avatar is never worth failing a page load over — so every path here ends
 * with a usable identity.
 */
export function loadIdentity() {
  const fallback = { userId: randomSeed(), name: "", avatarSeed: randomSeed() };
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      saveIdentity(fallback);
      return fallback;
    }
    const parsed = JSON.parse(raw);
    const identity = {
      // Stable per device, and deliberately not per tab: two windows of the
      // same editor are one person in the room, not two.
      userId:
        typeof parsed?.userId === "string" && parsed.userId
          ? parsed.userId
          : fallback.userId,
      name: typeof parsed?.name === "string" ? parsed.name : "",
      avatarSeed:
        typeof parsed?.avatarSeed === "string" && parsed.avatarSeed
          ? parsed.avatarSeed
          : fallback.avatarSeed,
    };
    if (identity.userId !== parsed?.userId) saveIdentity(identity);
    return identity;
  } catch {
    return fallback;
  }
}

/** Persists the identity. Silently does nothing where storage is unavailable. */
export function saveIdentity(identity) {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: identity?.userId ?? randomSeed(),
        name: identity?.name ?? "",
        avatarSeed: identity?.avatarSeed ?? randomSeed(),
      }),
    );
  } catch {
    // Blocked storage: the identity simply lasts as long as the tab does.
  }
}

/**
 * Resolves the collaboration identity shown to peers.
 *
 * When authenticated with a VOO Cloud account, the collaboration identity
 * displays the account display name (or email prefix) and account avatar.
 * When unauthenticated, it falls back to the guest identity without ever
 * overwriting or discarding the guest nickname.
 */
export function resolveCollabIdentity(user, guestIdentity) {
  const guest = guestIdentity ?? loadIdentity();
  if (user?.isLoggedIn && (user?.name || user?.email)) {
    const accountName = (user.name?.trim() || user.email?.split("@")[0] || "").trim();
    return {
      userId: user.id || guest.userId,
      name: accountName,
      avatarSeed: guest.avatarSeed || accountName || "creator",
      avatarUrl: user.avatarUrl || null,
    };
  }
  return {
    userId: guest.userId,
    name: guest.name ?? "",
    avatarSeed: guest.avatarSeed,
    avatarUrl: null,
  };
}
