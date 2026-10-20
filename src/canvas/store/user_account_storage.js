import { loadIdentity, avatarUrl } from "../collab/identity.js";
import { AUTH_USER_STORAGE_KEY } from "../../shared/auth_storage_keys.js";

export function guestUser() {
  const identity = loadIdentity();
  return {
    id: identity.userId,
    name: identity.name || "Guest",
    email: "",
    avatarUrl: avatarUrl(identity.avatarSeed),
    bio: "",
    badge: "Guest",
    role: "user",
    isLoggedIn: false,
    createdAt: Date.now(),
  };
}

export function loadSavedUser() {
  try {
    const raw = globalThis.localStorage?.getItem(AUTH_USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    // Ignore storage issues
  }
  return guestUser();
}

export function saveUser(user) {
  try {
    globalThis.localStorage?.setItem(
      AUTH_USER_STORAGE_KEY,
      JSON.stringify(user),
    );
  } catch {
    // Ignore
  }
}

export function clearSavedUser() {
  try {
    globalThis.localStorage?.removeItem(AUTH_USER_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function serverUserToLocal(serverUser) {
  const fallback = avatarUrl(serverUser.name || serverUser.email || "Creator");
  return {
    id: serverUser.id,
    name: serverUser.name || serverUser.email?.split("@")[0] || "VOO Creator",
    email: serverUser.email || "",
    avatarUrl: serverUser.avatarUrl || fallback,
    bio: serverUser.bio || "",
    badge: serverUser.badge || "Creator",
    role: serverUser.role || "user",
    // Only an explicit false from the service means "not yet verified";
    // older responses without the field never show the verify prompt.
    emailVerified: serverUser.emailVerified !== false,
    isLoggedIn: true,
    createdAt: Date.parse(serverUser.createdAt) || Date.now(),
  };
}
