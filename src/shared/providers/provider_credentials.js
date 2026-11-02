/** Shared credential resolution for providers that support VOO Credits. */

import { AUTH_TOKEN_STORAGE_KEY } from "../auth_storage_keys.js";

const CREDITS_AVAILABLE_KEY = "voo.credits.available";
export const AUTH_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_AUTH_BASE_URL) ||
  "https://voo.run/v1/auth";

export const PROVIDER_AUTH_MODE = {
  OWN_KEY: "own-key",
  CREDITS: "credits",
  SIGN_IN_REQUIRED: "sign-in-required",
};

export function readBrowserAuthToken() {
  try {
    return globalThis.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function readBrowserCreditsAvailable() {
  try {
    const raw =
      globalThis.sessionStorage?.getItem(CREDITS_AVAILABLE_KEY) ??
      globalThis.localStorage?.getItem(CREDITS_AVAILABLE_KEY);
    if (raw === null || raw === undefined) return null;
    return raw === "true";
  } catch {
    return null;
  }
}

export function saveBrowserCreditsAvailable(available) {
  try {
    if (typeof available === "boolean") {
      globalThis.sessionStorage?.setItem(
        CREDITS_AVAILABLE_KEY,
        String(available),
      );
    } else {
      globalThis.sessionStorage?.removeItem(CREDITS_AVAILABLE_KEY);
      globalThis.localStorage?.removeItem(CREDITS_AVAILABLE_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

/**
 * Resolve one provider's route. An explicit token is required for worker and
 * Electron calls because those contexts cannot read the editor's localStorage.
 */
export function resolveProviderCredential({
  apiKey,
  authToken,
  creditsAvailable,
} = {}) {
  const normalizedKey = typeof apiKey === "string" ? apiKey.trim() : "";
  if (normalizedKey) {
    return {
      mode: PROVIDER_AUTH_MODE.OWN_KEY,
      apiKey: normalizedKey,
      token: "",
    };
  }
  const isAvailable =
    typeof creditsAvailable === "boolean"
      ? creditsAvailable
      : readBrowserCreditsAvailable();
  if (isAvailable === false) {
    return { mode: PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED, apiKey: "", token: "" };
  }
  const token =
    typeof authToken === "string" && authToken.trim()
      ? authToken.trim()
      : readBrowserAuthToken();
  if (token) return { mode: PROVIDER_AUTH_MODE.CREDITS, apiKey: "", token };
  return { mode: PROVIDER_AUTH_MODE.SIGN_IN_REQUIRED, apiKey: "", token: "" };
}

export function vooServiceBaseUrl(service) {
  const authUrl = new URL(AUTH_BASE_URL);
  const authPath = authUrl.pathname.replace(/\/+$/, "");
  const versionPath = authPath.endsWith("/auth")
    ? authPath.slice(0, -"/auth".length)
    : authPath;
  authUrl.pathname = `${versionPath}/${service}`.replace(/\/+/g, "/");
  return authUrl.toString().replace(/\/$/, "");
}

export function creditsApiBase(upstream) {
  return vooServiceBaseUrl(`ai/${upstream}`);
}

export function creditsBaseUrl() {
  return vooServiceBaseUrl("credits");
}

export function creditsHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function creditsBalanceFromResponse(response) {
  const value = response?.headers?.get?.("X-VOO-Credits-Balance");
  if (value === null || value === undefined || value === "") return null;
  const balance = Number(value);
  return Number.isInteger(balance) && balance >= 0 ? balance : null;
}

export function providerErrorCode(payload, status, mapHttpStatus = true) {
  const code =
    typeof payload?.error === "string"
      ? payload.error
      : (payload?.error?.code ?? payload?.code);
  const knownCodes = new Set([
    "insufficientCredits",
    "modelNotPriced",
    "upstreamNotConfigured",
    "tooManyRequests",
    "notSignedIn",
  ]);
  if (typeof code === "string" && knownCodes.has(code)) return code;
  if (mapHttpStatus && status === 401) return "notSignedIn";
  if (mapHttpStatus && status === 402) return "insufficientCredits";
  if (mapHttpStatus && status === 403) return "modelNotPriced";
  if (mapHttpStatus && status === 429) return "tooManyRequests";
  return null;
}
