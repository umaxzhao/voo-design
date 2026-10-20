/**
 * The capability vocabulary the local backends are described in.
 *
 * This module is the single place that answers "can a local backend do X?".
 * Everything above it — the provider dispatcher, the provider
 * registry, the settings badges — reads these helpers instead of testing for a
 * function name or repeating a `mediaType === …` branch. Adding a new local
 * model therefore means writing a client and one row in `local_backends.js`;
 * nothing in this file or its callers needs a new `if`.
 *
 * It deliberately imports nothing. `providers.js` needs these helpers to decide
 * which media the `local` provider is offered for, and `local_backends.js` needs
 * the capability ids, so importing `API_MEDIA_TYPE` from `providers.js` here
 * would close a cycle. The media strings below mirror `API_MEDIA_TYPE`; a unit
 * test asserts they stay equal.
 */

/** Capability ids. These are the same strings used as model `capabilities`. */
export const LOCAL_CAPABILITY = {
  IMAGE_GENERATION: "image-generation",
  IMAGE_EDIT: "image-edit",
  MODEL_3D_GENERATION: "model3d-generation",
  VIDEO_GENERATION: "video-generation",
};

/** Mirrors `API_MEDIA_TYPE` from `providers.js`; see the module note above. */
export const LOCAL_MEDIA = {
  IMAGE: "image",
  VIDEO: "video",
  TEXT: "text",
  AUDIO: "audio",
  MODEL_3D: "model3d",
};

/**
 * Which capabilities can serve each medium, most specific first.
 *
 * "Can serve" is deliberately provider-level, not backend-level: the `local`
 * provider is offered wherever *some* backend can do the job. The dispatcher
 * picks the actual backend and capability per request.
 *
 * An empty list means the `local` provider is not offered for that media.
 */
export const LOCAL_MEDIA_CAPABILITIES = {
  [LOCAL_MEDIA.IMAGE]: [
    LOCAL_CAPABILITY.IMAGE_EDIT,
    LOCAL_CAPABILITY.IMAGE_GENERATION,
  ],
  [LOCAL_MEDIA.MODEL_3D]: [LOCAL_CAPABILITY.MODEL_3D_GENERATION],
  [LOCAL_MEDIA.VIDEO]: [LOCAL_CAPABILITY.VIDEO_GENERATION],
  [LOCAL_MEDIA.AUDIO]: [],
  [LOCAL_MEDIA.TEXT]: [],
};

/** The capabilities that could serve a medium, most specific first. */
export function capabilitiesForMedia(mediaType) {
  return LOCAL_MEDIA_CAPABILITIES[mediaType] ?? [];
}

/** True when the `local` provider has any backend for this medium. */
export function localProviderSupportsMedia(mediaType) {
  return capabilitiesForMedia(mediaType).length > 0;
}

/** The capability map a backend row declares. */
export function backendCapabilities(backend) {
  return backend?.capabilities ?? {};
}

/** True when one backend declares a capability. */
export function backendSupports(backend, capability) {
  return Boolean(backendCapabilities(backend)[capability]);
}

/**
 * The model names one capability entry exposes.
 *
 * A capability can list its own models, or fall back to the row's fixed
 * `modelId`. Bundled here so the provider and the settings panel do not each
 * invent their own fallback rule.
 */
export function capabilityModelNames(entry, backend, endpoint) {
  if (typeof entry?.models === "function") return entry.models(endpoint);
  return backend?.modelId ? [backend.modelId] : [];
}

/** Every model name a backend declares across its capabilities, deduped. */
export async function backendModelNames(backend, endpoint) {
  const names = new Set();
  for (const entry of Object.values(backendCapabilities(backend))) {
    for (const name of await capabilityModelNames(entry, backend, endpoint)) {
      names.add(name);
    }
  }
  return [...names];
}

/**
 * Picks the capability a request should run through, or null.
 *
 * Images are the only ambiguous case: an image request with a source image can
 * be an edit, while a text-only image request is a generation. The specific
 * capability wins when the backend has it, and an edit-only backend keeps the
 * edit capability for a text-only request so its own "requires a reference
 * image" error is the one the user sees — rather than a generic "no model".
 *
 * A request *with* a source image is never answered by a generation-only
 * backend: null lets the provider raise `localBackend.mediaUnsupported`, which
 * is degradable. The alternative — running the generator and dropping the
 * reference — looks like success while quietly discarding the picture the user
 * asked to modify, which is exactly what a repaint must never do.
 */
export function resolveLocalCapability(backend, mediaType, request = {}) {
  if (mediaType === LOCAL_MEDIA.IMAGE) {
    if (request?.image) {
      return backendSupports(backend, LOCAL_CAPABILITY.IMAGE_EDIT)
        ? LOCAL_CAPABILITY.IMAGE_EDIT
        : null;
    }
    if (backendSupports(backend, LOCAL_CAPABILITY.IMAGE_GENERATION)) {
      return LOCAL_CAPABILITY.IMAGE_GENERATION;
    }
    if (backendSupports(backend, LOCAL_CAPABILITY.IMAGE_EDIT)) {
      return LOCAL_CAPABILITY.IMAGE_EDIT;
    }
    return null;
  }
  return (
    capabilitiesForMedia(mediaType).find((capability) =>
      backendSupports(backend, capability),
    ) ?? null
  );
}

/**
 * The sentence key that explains a request the local backend cannot serve.
 *
 * `resolveLocalCapability` answers null for several different situations that
 * share one error code (`localBackend.mediaUnsupported`, raised by the
 * provider). Image requests use the editor's existing unsupported-edit
 * guidance; other media use the generic missing-capability message.
 *
 * @param {string} [mediaType] the failing request's medium (`LOCAL_MEDIA.*`)
 * @returns {string} a dictionary key with copy on both locales
 */
export function localUnsupportedMessageKey(mediaType) {
  return mediaType === LOCAL_MEDIA.IMAGE
    ? "error.providerUnsupportedMedia"
    : "localBackend.mediaUnsupported";
}
