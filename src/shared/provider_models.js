/**
 * The model catalogue each provider is *currently known* to offer.
 *
 * Three sources feed one list, and they arrive at different times:
 *
 *  - the built-in defaults in providers.js, available before any network call;
 *  - whatever the provider answers when asked for its catalogue, which needs a
 *    key and a round trip;
 *  - models the user typed in by hand, for anything the provider serves but
 *    does not advertise.
 *
 * Only the last two are stored. Persisting the built-ins as well would freeze
 * a snapshot of them, so a model added to the app in a later version would
 * never appear for anyone who had already opened this screen.
 *
 * Removing a built-in is the exception that tests the rule: the model ships
 * with the app, so there is nothing to delete — instead its id joins a
 * "hidden" list inside the same stored object, and the merge consults it.
 * Future built-ins still appear; only the ones the user named stay away.
 */

import {
  API_MEDIA_TYPE,
  AI_302_TEXT_MODELS,
  CLI_TEXT_MODELS,
  DASHSCOPE_IMAGE_MODELS,
  DASHSCOPE_TEXT_MODELS,
  DASHSCOPE_VIDEO_MODELS,
  DEEPSEEK_TEXT_MODELS,
  DEFAULT_API_IMAGE_MODELS,
  DEFAULT_API_VIDEO_MODELS,
  MINIMAX_TEXT_MODELS,
  MODELSCOPE_TEXT_MODELS,
  OPENROUTER_TEXT_MODELS,
  VOLCENGINE_IMAGE_MODELS,
  VOLCENGINE_TEXT_MODELS,
  VOLCENGINE_VIDEO_MODELS,
  ZHIPU_IMAGE_MODELS,
  ZHIPU_TEXT_MODELS,
  ZHIPU_VIDEO_MODELS,
  PROVIDER_ID,
} from "./providers.js";

/** `{ [providerId]: { [mediaType]: [{ id, label }] } }` */
export const PROVIDER_MODELS_KEY = "ciw.providerModels";

/**
 * Reserved top-level key in the stored object: `{ [providerId]: { [mediaType]:
 * [modelId] } }`, the built-ins the user removed. It sits beside the provider
 * ids rather than inside one, and no real provider id can collide with it.
 */
const HIDDEN_KEY = "$hidden";

/** Ids of built-in models the user removed, for one provider and medium. */
function hiddenBuiltInIds(stored, providerId, mediaType) {
  return new Set(stored?.[HIDDEN_KEY]?.[providerId]?.[mediaType] ?? []);
}

/** The catalogue shipped with the app, by provider and medium. */
export const BUILT_IN_MODELS = {
  [PROVIDER_ID.AI_302]: {
    [API_MEDIA_TYPE.IMAGE]: DEFAULT_API_IMAGE_MODELS,
    [API_MEDIA_TYPE.VIDEO]: DEFAULT_API_VIDEO_MODELS,
    [API_MEDIA_TYPE.TEXT]: AI_302_TEXT_MODELS,
  },
  [PROVIDER_ID.DASHSCOPE]: {
    [API_MEDIA_TYPE.IMAGE]: DASHSCOPE_IMAGE_MODELS,
    [API_MEDIA_TYPE.VIDEO]: DASHSCOPE_VIDEO_MODELS,
    [API_MEDIA_TYPE.TEXT]: DASHSCOPE_TEXT_MODELS,
  },
  [PROVIDER_ID.DEEPSEEK]: {
    [API_MEDIA_TYPE.TEXT]: DEEPSEEK_TEXT_MODELS,
  },
  [PROVIDER_ID.OPENROUTER]: {
    [API_MEDIA_TYPE.TEXT]: OPENROUTER_TEXT_MODELS,
  },
  [PROVIDER_ID.VOLCENGINE]: {
    [API_MEDIA_TYPE.TEXT]: VOLCENGINE_TEXT_MODELS,
    [API_MEDIA_TYPE.IMAGE]: VOLCENGINE_IMAGE_MODELS,
    [API_MEDIA_TYPE.VIDEO]: VOLCENGINE_VIDEO_MODELS,
  },
  [PROVIDER_ID.ZHIPU]: {
    [API_MEDIA_TYPE.TEXT]: ZHIPU_TEXT_MODELS,
    [API_MEDIA_TYPE.IMAGE]: ZHIPU_IMAGE_MODELS,
    [API_MEDIA_TYPE.VIDEO]: ZHIPU_VIDEO_MODELS,
  },
  [PROVIDER_ID.MINIMAX]: {
    [API_MEDIA_TYPE.TEXT]: MINIMAX_TEXT_MODELS,
  },
  [PROVIDER_ID.MODELSCOPE]: {
    [API_MEDIA_TYPE.TEXT]: MODELSCOPE_TEXT_MODELS,
  },
  // The local engine's models are whichever checkpoints the user installed;
  // only that backend can enumerate them, so nothing is built in.
  [PROVIDER_ID.LOCAL]: {},
  [PROVIDER_ID.CLI]: {
    [API_MEDIA_TYPE.TEXT]: CLI_TEXT_MODELS,
  },
};

/** The media a provider deals in, in display order. */
export function mediaTypesFor(providerId) {
  const order = [
    API_MEDIA_TYPE.IMAGE,
    API_MEDIA_TYPE.VIDEO,
    API_MEDIA_TYPE.TEXT,
  ];
  const built = BUILT_IN_MODELS[providerId];
  if (!built || Object.keys(built).length === 0) return order;
  return order.filter((mediaType) => built[mediaType]);
}

/** A model entry, normalised, or null when the id is unusable. */
function normalise(model) {
  const id = typeof model === "string" ? model : model?.id;
  if (typeof id !== "string" || !id.trim()) return null;
  const trimmed = id.trim();
  const label = typeof model?.label === "string" && model.label.trim();
  return { id: trimmed, label: label || trimmed };
}

/**
 * Everything known for one provider and medium: built-ins first, then stored.
 *
 * Order matters — the built-ins are the curated names, and a fetched catalogue
 * routinely repeats them with a bare id for a label. First entry wins, so the
 * readable label survives the merge.
 */
export function providerModelList(stored, providerId, mediaType) {
  const built = BUILT_IN_MODELS[providerId]?.[mediaType] ?? [];
  const extra = stored?.[providerId]?.[mediaType] ?? [];
  const hidden = hiddenBuiltInIds(stored, providerId, mediaType);
  const extraIds = new Set(
    extra.map((model) => normalise(model)?.id).filter(Boolean),
  );
  const seen = new Set();
  const out = [];
  for (const model of [...built, ...extra]) {
    const entry = normalise(model);
    if (!entry || seen.has(entry.id)) continue;
    // A removed built-in stays hidden unless the user typed it back in by
    // hand — the re-add is explicit, a fetched catalogue is not.
    if (hidden.has(entry.id) && !extraIds.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

/** Whether an id came from the app rather than from this screen. */
export function isBuiltInModel(providerId, mediaType, modelId) {
  return (BUILT_IN_MODELS[providerId]?.[mediaType] ?? []).some(
    (model) => model.id === modelId,
  );
}

function withEntries(stored, providerId, mediaType, entries) {
  return {
    ...stored,
    [providerId]: { ...(stored?.[providerId] ?? {}), [mediaType]: entries },
  };
}

/**
 * Folds a fetched catalogue into what is stored.
 *
 * Anything already built in is dropped rather than copied: storing it would
 * pin today's version of the list, and the point of asking the provider is to
 * learn what it has *beyond* what shipped.
 */
export function mergeFetchedModels(stored, providerId, mediaType, fetched) {
  // Hidden built-ins count as known: a fetch must not resurrect a model the
  // user removed, or the delete would appear to work only until the next sync.
  const known = new Set([
    ...providerModelList(stored, providerId, mediaType).map(
      (model) => model.id,
    ),
    ...hiddenBuiltInIds(stored, providerId, mediaType),
  ]);
  const additions = [];
  for (const model of fetched ?? []) {
    const entry = normalise(model);
    if (!entry || known.has(entry.id)) continue;
    known.add(entry.id);
    additions.push(entry);
  }
  if (additions.length === 0) return stored ?? {};
  const existing = stored?.[providerId]?.[mediaType] ?? [];
  return withEntries(stored, providerId, mediaType, [
    ...existing,
    ...additions,
  ]);
}

/**
 * Adds one hand-typed model.
 *
 * @returns {{stored: object, added: boolean}} `added` is false when the id was
 *   already known, so the caller can say so rather than appear to do nothing.
 */
export function addProviderModel(stored, providerId, mediaType, model) {
  const entry = normalise(model);
  if (!entry) return { stored: stored ?? {}, added: false };
  const known = providerModelList(stored, providerId, mediaType);
  if (known.some((item) => item.id === entry.id)) {
    return { stored: stored ?? {}, added: false };
  }
  const existing = stored?.[providerId]?.[mediaType] ?? [];
  return {
    stored: withEntries(stored, providerId, mediaType, [...existing, entry]),
    added: true,
  };
}

/**
 * Updates a model's ID or display name.
 */
export function updateProviderModel(
  stored,
  providerId,
  mediaType,
  oldModelId,
  newModel,
) {
  const entry = normalise(newModel);
  if (!entry) return stored ?? {};

  let nextStored = removeProviderModel(
    stored,
    providerId,
    mediaType,
    oldModelId,
  );

  // If the new ID was previously hidden, unhide it
  const hidden = nextStored?.[HIDDEN_KEY]?.[providerId]?.[mediaType] ?? [];
  if (hidden.includes(entry.id)) {
    const unhidden = hidden.filter((id) => id !== entry.id);
    nextStored = {
      ...nextStored,
      [HIDDEN_KEY]: {
        ...(nextStored?.[HIDDEN_KEY] ?? {}),
        [providerId]: {
          ...(nextStored?.[HIDDEN_KEY]?.[providerId] ?? {}),
          [mediaType]: unhidden,
        },
      },
    };
  }

  const existing = nextStored?.[providerId]?.[mediaType] ?? [];
  const filtered = existing.filter((m) => m.id !== entry.id);
  return withEntries(nextStored, providerId, mediaType, [...filtered, entry]);
}

/**
 * Removes a model from the list this screen shows.
 *
 * A stored model is simply filtered out. A built-in is not in the stored
 * list, so there is nothing to delete — instead its id is recorded under
 * `$hidden`, and `providerModelList` skips it from then on. Typing the id
 * into the add box brings it back: a hand-typed entry outranks the hiding.
 */
export function removeProviderModel(stored, providerId, mediaType, modelId) {
  const existing = stored?.[providerId]?.[mediaType] ?? [];
  const next = existing.filter((model) => model.id !== modelId);
  if (next.length !== existing.length) {
    return withEntries(stored, providerId, mediaType, next);
  }
  if (!isBuiltInModel(providerId, mediaType, modelId)) return stored ?? {};
  const hidden = stored?.[HIDDEN_KEY]?.[providerId]?.[mediaType] ?? [];
  if (hidden.includes(modelId)) return stored ?? {};
  return {
    ...stored,
    [HIDDEN_KEY]: {
      ...(stored?.[HIDDEN_KEY] ?? {}),
      [providerId]: {
        ...(stored?.[HIDDEN_KEY]?.[providerId] ?? {}),
        [mediaType]: [...hidden, modelId],
      },
    },
  };
}
