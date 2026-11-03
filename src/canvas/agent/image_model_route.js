/**
 * Routing helpers for Image Mode model selection.
 *
 * The composer's selected model id (for example "302:qwen-image-3.0-pro") must
 * reach the image dispatcher as explicit provider/model arguments. Reading the
 * legacy global settings instead would silently generate with whatever model
 * was configured before the user picked one.
 */

import { PROVIDER_ID } from "../../shared/providers.js";

/**
 * Composer catalog prefixes that differ from the provider registry key.
 * model_catalog.js groups 302.AI models under "302", but the registered
 * provider id (providers.js PROVIDER_ID.AI_302) is "302ai".
 */
const CATALOG_PROVIDER_ALIASES = Object.freeze({
  302: PROVIDER_ID.AI_302,
});

/**
 * Splits "<providerId>:<modelId>" at the first colon.
 * Fails fast on a malformed id instead of guessing a provider.
 *
 * @param {string} modelId
 * @returns {{ providerId: string, modelId: string }}
 */
export function splitImageModelId(modelId) {
  const text = String(modelId ?? "");
  const index = text.indexOf(":");
  if (index <= 0 || index === text.length - 1) {
    throw Object.assign(new Error(`invalidImageModel: ${text}`), { code: "invalidImageModel" });
  }
  const prefix = text.slice(0, index);
  return {
    providerId: CATALOG_PROVIDER_ALIASES[prefix] ?? prefix,
    modelId: text.slice(index + 1),
  };
}

/**
 * True when the frozen selection context includes an image layer, which the
 * user expects to be used as the reference for generation.
 *
 * @param {object|null} context Selection context from readSelectionContext
 * @returns {boolean}
 */
export function hasSelectedImageReference(context) {
  if (!context) return false;
  // The real Regenerate action sets context.referenceImage without a node kind.
  if (context.referenceImage) return true;
  const nodes = Array.isArray(context.selection) ? context.selection : [context];
  return nodes.some((node) => node?.kind === "image");
}
