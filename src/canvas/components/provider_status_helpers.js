import { VERIFICATION_STATUS } from "./provider_verification_state.js";

const KNOWN_ERROR_KEYS = {
  providerUnauthorized: "error.providerUnauthorized",
  providerNetworkError: "error.providerNetworkError",
  providerTimeout: "error.providerTimeout",
  providerRequestFailed: "error.providerRequestFailed",
  providerInvalidResponse: "error.providerInvalidResponse",
  providerStorageUnavailable: "error.providerStorageUnavailable",
  providerKeyRequired: "error.providerKeyRequired",
  tooManyRequests: "error.tooManyRequests",
  cliFailed: "error.cliFailed",
  connectionFailed: "agent.connection.failed",
};

/**
 * Resolves a provider test error code into a localized string.
 */
export function getProviderErrorMessage(t, errorCode) {
  if (!errorCode) return t("agent.connection.failed");
  const key = KNOWN_ERROR_KEYS[errorCode];
  if (key) {
    return t(key);
  }
  return t("error.generic", { message: String(errorCode) });
}

/**
 * Derives visual status text, indicator dot class, and verification states for a provider.
 */
export function getProviderStatusInfo(t, { configured, verification }) {
  if (!configured) {
    return {
      statusText: t("provider.status.idle"),
      dotClass: "bg-neutral-600",
      statusClass: "text-neutral-500",
      isVerified: false,
      isError: false,
    };
  }
  if (verification?.status === VERIFICATION_STATUS.VERIFIED) {
    return {
      statusText: t("provider.status.verified"),
      dotClass: "bg-[#a7ffd4]",
      statusClass: "text-[#a7ffd4]",
      isVerified: true,
      isError: false,
    };
  }
  if (verification?.status === VERIFICATION_STATUS.TESTING) {
    return {
      statusText: t("provider.status.testing"),
      dotClass: "bg-amber-400/80",
      statusClass: "text-neutral-400",
      isVerified: false,
      isError: false,
    };
  }
  if (verification?.status === VERIFICATION_STATUS.ERROR) {
    return {
      statusText: getProviderErrorMessage(t, verification.error),
      dotClass: "bg-rose-400",
      statusClass: "text-rose-400",
      isVerified: false,
      isError: true,
    };
  }
  return {
    statusText: t("provider.status.configured"),
    dotClass: "bg-amber-400/80",
    statusClass: "text-neutral-400",
    isVerified: false,
    isError: false,
  };
}
