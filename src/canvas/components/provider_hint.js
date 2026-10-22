import { PROVIDER_ID, defaultModelsFor } from "../../shared/providers.js";

const LOCAL_POINTER_CODES = new Set([
  "localBackend.unreachable",
  "localBackend.noCheckpoint",
]);

/**
 * Why the selected provider cannot run yet, and where to fix it.
 */
export function providerBlockedHint(
  t,
  provider,
  providerId,
  runsOnCredits = false,
) {
  if (providerId !== PROVIDER_ID.LOCAL) {
    return runsOnCredits
      ? t("api.configureHintCredits")
      : t("api.configureHint");
  }
  const code = provider?.error ?? "localBackend.unreachable";
  const reason = t(code);
  return LOCAL_POINTER_CODES.has(code)
    ? `${reason} · ${t("api.localConfigureHint")}`
    : reason;
}

/**
 * Whether the app's own catalogue marks a model id as unverified.
 */
export function isUnverifiedModelId(providerId, mediaType, modelId) {
  return defaultModelsFor(providerId, mediaType).some(
    (model) => model.id === modelId && model.unverified,
  );
}

/**
 * The note for a model the gateway could not confirm, or null when it is fine.
 */
export function unverifiedModelNote(t, providerId, mediaType, modelId) {
  return isUnverifiedModelId(providerId, mediaType, modelId)
    ? t("api.modelUnverifiedHint")
    : null;
}
