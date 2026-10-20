import {
  AUTH_BASE_URL,
  vooServiceBaseUrl,
} from "../shared/providers/provider_credentials.js";
import { AUTH_TOKEN_STORAGE_KEY } from "../shared/auth_storage_keys.js";

/**
 * Every account error is an i18n code, never a display string. The store turns
 * the code into `user.error.<code>` and the modal renders it with t(), so a
 * server (or network) failure never surfaces raw English.
 *
 * `message` is an English fallback for the few pre-existing consumers that
 * still read it directly (e.g. the credits account section); new UI reads
 * `.code`.
 */
const AUTH_ERROR_FALLBACK = {
  network: "Network error while reaching the VOO account service.",
  notSignedIn: "Not signed in.",
  sessionExpired: "Your session has expired. Please sign in again.",
  invalidCredentials: "Incorrect email or password.",
  invalidRequest: "The request was invalid. Please try again.",
  invalidRegisterInput: "Please check the email, name and password fields.",
  invalidEmail: "Please enter a valid email address.",
  weakPassword: "Password must be at least 6 characters.",
  emailTaken: "An account with this email already exists.",
  disposableEmail: "Temporary email addresses cannot be used to sign up.",
  mailUnavailable: "Email is not available right now. Please try again later.",
  sendFailed: "The email could not be sent. Please try again later.",
  tooManyAttempts: "Too many wrong codes. Ask for a new one.",
  codeExpired: "The code has expired. Ask for a new one.",
  invalidAvatar: "That avatar selection is not available.",
  rateLimited: "Too many attempts. Please try again later.",
  databaseUnavailable: "The account service is temporarily unavailable.",
  serverError: "The account service hit an error. Please try again.",
  registrationFailed: "Registration failed. Please try again.",
  requestFailed: "The request failed. Please try again.",
  popupBlocked: "Please allow pop-ups for VOO to sign in.",
  appUpdateRequired: "Please update the VOO desktop app to sign in.",
  cancelled: "Sign in was cancelled.",
  oauthTimeout: "Sign in timed out. Please try again.",
  oauthFailed: "OAuth sign-in failed. Please try again.",
  invalidCode: "The sign-in link is no longer valid. Please try again.",
  invalidVerifier: "The sign-in request could not be verified. Please try again.",
  expired: "The sign-in link has expired. Please try again.",
};

class AuthError extends Error {
  constructor(code, status) {
    super(AUTH_ERROR_FALLBACK[code] || AUTH_ERROR_FALLBACK.requestFailed);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

function errorCodeFrom(payload, status) {
  if (payload && typeof payload.error === "string" && payload.error) {
    return payload.error;
  }
  if (status === 401) return "sessionExpired";
  if (status === 429) return "rateLimited";
  if (status >= 500) return "serverError";
  return "requestFailed";
}

async function authFetch(path, { method = "GET", body, token } = {}) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${AUTH_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (error) {
    throw new AuthError("network");
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthError(errorCodeFrom(payload, response.status), response.status);
  }
  return payload;
}

export function authToken() {
  try {
    return globalThis.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveAuthToken(token) {
  try {
    if (token) globalThis.localStorage?.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    else globalThis.localStorage?.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export async function registerAccount({
  email,
  name,
  password,
  avatarSeed,
  avatarColor,
  locale,
}) {
  const payload = await authFetch("/register", {
    method: "POST",
    body: {
      email,
      name,
      password,
      avatarSeed,
      avatarColor,
      locale: locale === "en" ? "en" : "zh",
    },
  });
  saveAuthToken(payload.token);
  return payload.user;
}

export async function loginAccount({ email, password }) {
  const payload = await authFetch("/login", {
    method: "POST",
    body: { email, password },
  });
  saveAuthToken(payload.token);
  return payload.user;
}

/**
 * Emails the signed-in account a new verification code. Resolves false when
 * nothing was sent (already verified, or asked too often).
 */
export async function resendVerificationEmail({ locale }) {
  const payload = await authFetch("/verify-email/resend", {
    method: "POST",
    token: authToken(),
    body: { locale: locale === "en" ? "en" : "zh" },
  });
  return Boolean(payload?.sent);
}

/**
 * Checks the 6-digit code from the verification email. Resolves with the
 * sign-up bonus credits paid (0 when none).
 */
export async function confirmEmailCode({ code }) {
  const payload = await authFetch("/verify-email/confirm", {
    method: "POST",
    token: authToken(),
    body: { code },
  });
  return Number(payload?.bonusCredits) || 0;
}

/**
 * Asks the account service to email a password reset link. It answers the
 * same whether or not the address has an account.
 */
export async function requestPasswordReset({ email, locale }) {
  await authFetch("/password-reset/request", {
    method: "POST",
    body: { email, locale: locale === "en" ? "en" : "zh" },
  });
}

export async function logoutAccount() {
  const token = authToken();
  saveAuthToken("");
  if (!token) return;
  try {
    await authFetch("/logout", { method: "POST", token });
  } catch {
    // Local logout still succeeds even if the server is unreachable.
  }
}

export async function fetchCurrentUser() {
  const token = authToken();
  if (!token) return null;
  const payload = await authFetch("/me", { token });
  return payload.user || null;
}

export async function updateAccountProfile({ name, bio, avatarUrl }) {
  const token = authToken();
  if (!token) throw new AuthError("notSignedIn");
  const payload = await authFetch("/me", {
    method: "PATCH",
    token,
    body: { name, bio, avatarUrl },
  });
  return payload.user;
}

async function creditsFetch(path, options = {}) {
  const token = authToken();
  if (!token) throw new AuthError("notSignedIn");
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (options.body) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${vooServiceBaseUrl("credits")}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new AuthError("network");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AuthError(errorCodeFrom(payload, response.status), response.status);
  return payload;
}

export function fetchCreditsBalance() {
  return creditsFetch("/balance");
}

export function fetchCreditsLedger({ limit = 50, before } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  return creditsFetch(`/ledger?${params}`);
}

export function fetchCreditsPricing() {
  return fetch(`${vooServiceBaseUrl("credits")}/pricing`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new AuthError(errorCodeFrom(payload, response.status), response.status);
    return payload;
  });
}

export function redeemCredits(code) {
  return creditsFetch("/redeem", { method: "POST", body: { code } });
}

export async function oauthProviders() {
  try {
    const payload = await authFetch("/providers");
    return Array.isArray(payload?.providers) ? payload.providers : [];
  } catch {
    return [];
  }
}

export function generateOAuthNonce() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Where the sign-in page sends the system browser once the desktop app has been authorised. */
export const DESKTOP_AUTH_RETURN_URL = "voo://auth";

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * S256 PKCE pair for the OAuth *delivery* handoff. The verifier stays in this
 * device; the server stores only the challenge, so a delivery code is useless
 * to anyone who steals it (SEC-1).
 */
export async function generateOAuthPkce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64Url(bytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/** Redeem a delivery code for the session, using the verifier that minted it. */
export async function exchangeOAuthCode(code, codeVerifier) {
  let response;
  try {
    response = await fetch(`${AUTH_BASE_URL}/oauth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code, codeVerifier }),
      cache: "no-store",
    });
  } catch {
    throw new AuthError("network");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthError(errorCodeFrom(payload, response.status), response.status);
  }
  if (!payload.token) throw new AuthError("oauthFailed");
  saveAuthToken(payload.token);
  return payload.user;
}

function oauthOrigin() {
  try {
    return new URL(AUTH_BASE_URL).origin;
  } catch {
    return "";
  }
}

function openOAuthPopup() {
  try {
    return globalThis.window?.open?.(
      "about:blank",
      "voo_oauth",
      "width=540,height=680,menubar=no,toolbar=no,location=no,status=no",
    );
  } catch {
    return null;
  }
}

function closePopup(popup) {
  try {
    popup?.close?.();
  } catch {
    // Already closed.
  }
}

/**
 * Wait for the callback to hand back a one-time code, then exchange it.
 *
 *  - Browser/extension: the callback `postMessage`s { nonce, code } to this
 *    window (its opener). Only a matching nonce is accepted.
 *  - Desktop: the system browser follows `voo://auth?code=...`; the app receives
 *    it and this side polls the preload bridge. The code only ever lands on the
 *    machine that completed sign-in.
 */
function waitForOAuthDelivery({
  nonce,
  verifier,
  desktop,
  timeoutMs,
  signal,
  popup,
}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exchanging = false;
    let timer = null;
    let desktopTimer = null;
    let popupTimer = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (desktopTimer) clearInterval(desktopTimer);
      if (popupTimer) clearInterval(popupTimer);
      try {
        globalThis.window?.removeEventListener?.("message", onMessage);
      } catch {
        // No listener support in this environment.
      }
      try {
        signal?.removeEventListener?.("abort", onAbort);
      } catch {
        // Ignore.
      }
    };

    const fail = (code) => {
      if (settled) return;
      cleanup();
      reject(new AuthError(code));
    };

    const succeed = (code) => {
      if (settled || exchanging) return;
      exchanging = true;
      exchangeOAuthCode(code, verifier)
        .then((user) => {
          if (settled) return;
          cleanup();
          resolve(user);
        })
        .catch((err) => {
          if (settled) return;
          cleanup();
          reject(err instanceof AuthError ? err : new AuthError("oauthFailed"));
        });
    };

    function onMessage(event) {
      if (settled || exchanging) return;
      if (event?.origin && event.origin !== oauthOrigin()) return;
      const data = event?.data;
      if (!data || data.type !== "voo-oauth-complete") return;
      if (data.nonce !== nonce) return;
      if (typeof data.code !== "string" || !data.code) return;
      succeed(data.code);
    }

    function onAbort() {
      fail("cancelled");
    }

    if (signal?.aborted) {
      fail("cancelled");
      return;
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });

    if (desktop) {
      if (typeof globalThis.window?.vooElectron?.consumeAuthCode !== "function") {
        fail("appUpdateRequired");
        return;
      }
      desktopTimer = setInterval(async () => {
        if (settled || exchanging) return;
        try {
          const code = await globalThis.window.vooElectron.consumeAuthCode();
          if (typeof code === "string" && code) succeed(code);
        } catch {
          // Keep polling until the timeout.
        }
      }, 500);
    } else {
      globalThis.window?.addEventListener?.("message", onMessage);
      if (popup) {
        popupTimer = setInterval(() => {
          if (settled || exchanging) return;
          if (popup.closed) fail("cancelled");
        }, 500);
      }
    }

    timer = setTimeout(() => fail("oauthTimeout"), timeoutMs);
  });
}

export async function startOAuth(
  provider,
  { timeoutMs = 120000, signal } = {},
) {
  const nonce = generateOAuthNonce();
  const desktop = Boolean(globalThis.window?.vooElectron?.openInBrowser);

  // Open the popup synchronously, before the async PKCE digest, so the click's
  // user-gesture allowance is not lost to a popup blocker.
  let popup = null;
  if (!desktop) {
    popup = openOAuthPopup();
    if (!popup || popup.closed) {
      throw new AuthError("popupBlocked");
    }
  }

  const { verifier, challenge } = await generateOAuthPkce();
  if (signal?.aborted) {
    closePopup(popup);
    throw new AuthError("cancelled");
  }

  const params = new URLSearchParams({
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (desktop) params.set("redirect", DESKTOP_AUTH_RETURN_URL);
  const startUrl = `${AUTH_BASE_URL}/oauth/${encodeURIComponent(provider)}/start?${params.toString()}`;

  if (desktop) {
    void globalThis.window.vooElectron.openInBrowser(startUrl);
  } else {
    try {
      popup.location.href = startUrl;
    } catch {
      closePopup(popup);
      throw new AuthError("oauthFailed");
    }
  }

  try {
    return await waitForOAuthDelivery({
      nonce,
      verifier,
      desktop,
      timeoutMs,
      signal,
      popup,
    });
  } finally {
    closePopup(popup);
  }
}
