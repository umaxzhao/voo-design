/**
 * Provider connection verification state store.
 *
 * Tracks whether a provider has been actively tested via `testProvider`
 * rather than conflating "key configured in storage" with "verified endpoint".
 *
 * Distinct statuses:
 * - "untested": has configuration, but no active test run yet.
 * - "testing": test request in-flight.
 * - "verified": active test passed successfully.
 * - "error": active test failed, holding error code.
 */

import { useEffect, useState } from "react";
import { testProvider } from "../provider_client.js";

const VERIFICATION_EVENT = "ciw-provider-verification-changed";
const verificationMap = new Map();
const verificationVersions = new Map();
const pendingVerifications = new Map();

export const VERIFICATION_STATUS = {
  UNTESTED: "untested",
  TESTING: "testing",
  VERIFIED: "verified",
  ERROR: "error",
};

const VERIFICATION_CACHE_KEY = "voo_provider_verifications_cache";

function hydrateCache() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const raw = window.sessionStorage.getItem(VERIFICATION_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      for (const [id, item] of Object.entries(parsed)) {
        if (item && item.status === VERIFICATION_STATUS.VERIFIED) {
          verificationMap.set(id, item);
        }
      }
    }
  } catch {
    // Ignore storage parse error
  }
}

function persistCache() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const verifiedEntries = {};
    for (const [id, item] of verificationMap.entries()) {
      if (item?.status === VERIFICATION_STATUS.VERIFIED) {
        verifiedEntries[id] = item;
      }
    }
    window.sessionStorage.setItem(
      VERIFICATION_CACHE_KEY,
      JSON.stringify(verifiedEntries),
    );
  } catch {
    // Ignore storage write error
  }
}

hydrateCache();

/** Get the current verification state for a provider. */
export function getProviderVerification(providerId) {
  if (!providerId) return { status: VERIFICATION_STATUS.UNTESTED, error: null };
  return (
    verificationMap.get(providerId) ?? {
      status: VERIFICATION_STATUS.UNTESTED,
      error: null,
    }
  );
}

const dispatchVerificationEvent = (detail) => {
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    window.dispatchEvent(new CustomEvent(VERIFICATION_EVENT, { detail }));
  }
};

/** Set the verification state after a real testProvider call. */
export function setProviderVerification(providerId, { status, error = null }) {
  if (!providerId) return;
  verificationMap.set(providerId, {
    status: status ?? VERIFICATION_STATUS.UNTESTED,
    error: error ? String(error) : null,
    timestamp: Date.now(),
  });
  persistCache();
  dispatchVerificationEvent({ providerId });
}

/** Invalidate verification when credentials or endpoint changes. */
export function invalidateProviderVerification(providerId) {
  if (!providerId) return;
  verificationVersions.set(
    providerId,
    (verificationVersions.get(providerId) ?? 0) + 1,
  );
  pendingVerifications.delete(providerId);
  if (verificationMap.has(providerId)) {
    verificationMap.delete(providerId);
    persistCache();
    dispatchVerificationEvent({ providerId });
  }
}

/** Share one live check per provider and discard results from replaced keys. */
export function verifyProviderConnection(providerId, { force = false } = {}) {
  const pending = pendingVerifications.get(providerId);
  if (pending) return pending;
  if (
    !force &&
    getProviderVerification(providerId).status === VERIFICATION_STATUS.VERIFIED
  ) {
    return Promise.resolve({ connected: true });
  }

  const version = verificationVersions.get(providerId) ?? 0;
  setProviderVerification(providerId, { status: VERIFICATION_STATUS.TESTING });
  const verification = testProvider({ providerId })
    .then((result) => {
      if (result?.connected !== true) {
        const error = new Error("providerInvalidResponse");
        error.code = "providerInvalidResponse";
        throw error;
      }
      if (version === (verificationVersions.get(providerId) ?? 0)) {
        setProviderVerification(providerId, {
          status: VERIFICATION_STATUS.VERIFIED,
        });
        return result;
      }
      return { stale: true };
    })
    .catch((error) => {
      if (version === (verificationVersions.get(providerId) ?? 0)) {
        setProviderVerification(providerId, {
          status: VERIFICATION_STATUS.ERROR,
          error: error.code ?? "providerRequestFailed",
        });
        throw error;
      }
      return { stale: true };
    })
    .finally(() => {
      if (pendingVerifications.get(providerId) === verification) {
        pendingVerifications.delete(providerId);
      }
    });
  pendingVerifications.set(providerId, verification);
  return verification;
}

/** React hook subscribing to verification status of a provider. */
export function useProviderVerification(providerId) {
  const [verification, setVerification] = useState(() =>
    getProviderVerification(providerId),
  );

  useEffect(() => {
    const handler = (event) => {
      if (
        !event?.detail?.providerId ||
        event.detail.providerId === providerId
      ) {
        setVerification(getProviderVerification(providerId));
      }
    };
    window.addEventListener(VERIFICATION_EVENT, handler);
    return () => {
      window.removeEventListener(VERIFICATION_EVENT, handler);
    };
  }, [providerId]);

  return verification;
}

/** React hook subscribing to all verification statuses. */
export function useAllProviderVerifications() {
  const [verifications, setVerifications] = useState(
    () => new Map(verificationMap),
  );

  useEffect(() => {
    const handler = () => {
      setVerifications(new Map(verificationMap));
    };
    window.addEventListener(VERIFICATION_EVENT, handler);
    return () => {
      window.removeEventListener(VERIFICATION_EVENT, handler);
    };
  }, []);

  return verifications;
}
