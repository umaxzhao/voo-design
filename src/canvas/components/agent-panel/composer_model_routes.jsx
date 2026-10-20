/**
 * Default media models, set from the composer's "more" menu.
 *
 * Image, video and audio generation already have their defaults in the
 * Settings panel. Those live in one store — `voo.modelRoutes`, read and written
 * through `getStoredModelRoutesAsync` / `setModelRoute` — and this surface
 * reads and writes that same store instead of keeping a copy: it subscribes
 * with `onSettingChange`, so a change made in Settings shows up here without a
 * reload, and a change made here shows up in Settings.
 *
 * Why this is not `KeyModelRoutesPicker` from settings: its `ModelRouteRow`
 * places a provider select (`>=110px`) beside a model select (`>=150px`) next
 * to a label. The composer popover is 192px wide inside a 360px panel with
 * `overflow-hidden`, so that row would be clipped. One control per medium —
 * "Provider · Model" — fits the width that is actually available.
 *
 * Options come from the static catalogues (`defaultModelsFor`) rather than
 * `listProviderModels`: four routes across every candidate provider would cost
 * a dozen provider round-trips every time the menu opens. A model that a
 * provider only enumerates at runtime is therefore absent from the list until
 * Settings selects it — and once it is the stored choice it is always listed,
 * because a selection the catalogue does not contain is shown as-is. Silently
 * displaying a different model than the one that will run would be worse.
 *
 * The split is for the test suite: `react-dom/server` runs no effects, so the
 * row renders entirely from props and `ComposerModelRoutes` owns the store.
 */

import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROVIDER_ID,
  defaultModelsFor,
  getCombinedProviders,
} from "../../../shared/providers.js";
import {
  CAPABILITY,
  isCapabilitySupported,
} from "../../platform_capabilities.js";
import {
  AUTOMATIC_MODEL_ROUTE,
  LOCAL_BUILTIN_PROVIDER_ID,
  MODEL_ROUTE_ID,
  MODEL_ROUTES_KEY,
  SETTINGS_DEFAULT_ROUTES,
  getDefaultModelRoute,
  getStoredModelRoutesAsync,
  modelRouteDefinition,
  modelSupportsRoute,
  setModelRoute,
} from "../../../shared/model-routes.js";
import { onSettingChange } from "../../../shared/settings.js";
import { useProviderAuthModes } from "../../provider_route.js";
import { PROVIDER_AUTH_MODE } from "../../../shared/providers/provider_credentials.js";
import { useProviderConfigs } from "../../use_provider_state.js";
import { useI18n } from "../../use_i18n.js";
import ModelSelect from "../model_select.jsx";
import { ProviderLogo } from "../provider_icons.jsx";

/** The media the composer offers a default model for. */
const ROUTE_LABEL_KEY = Object.freeze({
  [MODEL_ROUTE_ID.IMAGE_GENERATION]: "agent.defaultModels.image",
  [MODEL_ROUTE_ID.VIDEO_GENERATION]: "agent.defaultModels.video",
  [MODEL_ROUTE_ID.AUDIO_GENERATION]: "agent.defaultModels.audio",
  [MODEL_ROUTE_ID.MODEL_3D_GENERATION]: "agent.defaultModels.model3d",
  [MODEL_ROUTE_ID.EDITOR_IMAGE]: "settings.modelRoutes.editor-image",
});

export const COMPOSER_MODEL_ROUTES = Object.freeze([
  MODEL_ROUTE_ID.IMAGE_GENERATION,
  MODEL_ROUTE_ID.VIDEO_GENERATION,
  MODEL_ROUTE_ID.AUDIO_GENERATION,
]);

export { SETTINGS_DEFAULT_ROUTES };

/**
 * One select carries both halves of a route, so the value is the pair.
 * Model ids are opaque strings that may contain "/" — the separator is one no
 * provider or model id contains.
 */
const OPTION_SEPARATOR = "::";

function encodeRouteOption(providerId, modelId) {
  return `${providerId}${OPTION_SEPARATOR}${modelId ?? ""}`;
}

/** The pair behind an option value; `AUTOMATIC_MODEL_ROUTE` clears it. */
export function decodeRouteOption(value) {
  if (value === AUTOMATIC_MODEL_ROUTE) {
    return { providerId: AUTOMATIC_MODEL_ROUTE, modelId: null };
  }
  const at = String(value).indexOf(OPTION_SEPARATOR);
  if (at < 0) {
    // Only this module builds option values, so an unrecognised one is a bug
    // here, not bad input to absorb.
    throw new Error("modelRouteOptionMalformed");
  }
  return {
    providerId: String(value).slice(0, at),
    modelId: String(value).slice(at + OPTION_SEPARATOR.length) || null,
  };
}

/** The route's stored choice, falling back to the built-in default. */
export function composerRouteSelection(routes, routeId) {
  const own = routes?.[routeId];
  if (own?.providerId) {
    return { providerId: own.providerId, modelId: own.modelId ?? null };
  }
  return (
    getDefaultModelRoute(routeId) ?? {
      providerId: AUTOMATIC_MODEL_ROUTE,
      modelId: null,
    }
  );
}

/** The providers a route can run on, in the order its options offer them. */
export function routeProviderIds(routeId, locale) {
  const definition = modelRouteDefinition(routeId);
  if (!definition) throw new Error("modelRouteUnknown");
  const customIds = getCombinedProviders(locale)
    .filter((provider) => provider.isCustom)
    .map((provider) => provider.id);
  return Array.from(new Set([...(definition.providers ?? []), ...customIds]));
}

/**
 * Every model the route's candidate providers declare, labelled with model name
 * and platform icon, with the stored choice first when the catalogue does not
 * contain it. Only configured providers are shown when providerConfigs is provided.
 */
export function buildRouteOptions(
  routeId,
  selection,
  locale,
  t,
  authModes = {},
  mode,
  cloudMode = false,
  providerConfigs = null,
) {
  const definition = modelRouteDefinition(routeId);
  if (!definition) throw new Error("modelRouteUnknown");
  const providerIds = routeProviderIds(routeId, locale);

  const tripoWebSupported = isCapabilitySupported(CAPABILITY.TRIPO_WEB, mode);

  const candidateProviderIds = providerConfigs
    ? providerIds.filter((providerId) => {
        if (cloudMode) return true;
        if (authModes?.[providerId] === PROVIDER_AUTH_MODE.CREDITS) return true;
        if (providerId === LOCAL_BUILTIN_PROVIDER_ID) return true;
        if (providerId === PROVIDER_ID.TRIPO_WEB) return tripoWebSupported;
        return Boolean(providerConfigs[providerId]);
      })
    : providerIds;

  const options = [];
  for (const providerId of candidateProviderIds) {
    const isTripoWeb = providerId === PROVIDER_ID.TRIPO_WEB;
    const tripoWebDisabled = isTripoWeb && !tripoWebSupported;
    const models = defaultModelsFor(providerId, definition.mediaType).filter(
      (model) => modelSupportsRoute(routeId, providerId, model),
    );
    for (const model of models) {
      const modelName = model.labelKey
        ? t(model.labelKey)
        : model.label || model.id;
      options.push({
        value: encodeRouteOption(providerId, model.id),
        label: tripoWebDisabled
          ? `${modelName} (${t("settings.modelRoutes.needsExtension")})`
          : modelName,
        icon: (
          <ProviderLogo
            providerId={providerId}
            size={14}
            className="size-3.5 shrink-0"
          />
        ),
        disabled: tripoWebDisabled,
        hint: tripoWebDisabled
          ? t("settings.modelRoutes.tripoWebNeedsExtension")
          : undefined,
        providerId,
        modelId: model.id,
      });
    }
  }

  if (selection.providerId !== AUTOMATIC_MODEL_ROUTE) {
    const value = encodeRouteOption(selection.providerId, selection.modelId);
    if (!options.some((option) => option.value === value)) {
      const isTripoWeb = selection.providerId === PROVIDER_ID.TRIPO_WEB;
      const tripoWebDisabled = isTripoWeb && !tripoWebSupported;
      const modelName = selection.modelId || selection.providerId;
      options.unshift({
        value,
        label: tripoWebDisabled
          ? `${modelName} (${t("settings.modelRoutes.needsExtension")})`
          : modelName,
        icon: (
          <ProviderLogo
            providerId={selection.providerId}
            size={14}
            className="size-3.5 shrink-0"
          />
        ),
        disabled: tripoWebDisabled,
        hint: tripoWebDisabled
          ? t("settings.modelRoutes.tripoWebNeedsExtension")
          : undefined,
        providerId: selection.providerId,
        modelId: selection.modelId,
      });
    }
  }

  return options;
}

/** One medium: its label and the provider/model pair that serves it. */
export function ComposerModelRouteRow({
  routeId,
  selection,
  onChange,
  labelKey,
  labelClassName,
  className,
  cloudMode = false,
}) {
  const { t, locale } = useI18n();
  const label = t(labelKey || ROUTE_LABEL_KEY[routeId]);
  // Which of this route's providers run on credits right now, so the row names
  // VOO instead of a vendor the user never chose.
  const providerIds = useMemo(
    () => routeProviderIds(routeId, locale),
    [routeId, locale],
  );
  const authModes = useProviderAuthModes(providerIds);
  const { configs: providerConfigs, loading: configsLoading } =
    useProviderConfigs();
  const filterByConfigs =
    typeof window !== "undefined" &&
    (!configsLoading || Object.keys(providerConfigs).length > 0);
  const options = useMemo(
    () =>
      buildRouteOptions(
        routeId,
        selection,
        locale,
        t,
        authModes,
        undefined,
        cloudMode,
        filterByConfigs ? providerConfigs : null,
      ),
    [
      routeId,
      selection,
      locale,
      t,
      authModes,
      cloudMode,
      filterByConfigs,
      providerConfigs,
    ],
  );
  const value =
    selection.providerId === AUTOMATIC_MODEL_ROUTE
      ? AUTOMATIC_MODEL_ROUTE
      : encodeRouteOption(selection.providerId, selection.modelId);

  return (
    <div
      data-testid={`agent-default-model-${routeId}`}
      className={className ?? "flex items-center gap-1.5 px-1 py-0.5"}
    >
      <span
        className={`shrink-0 text-[10px] truncate ${
          labelClassName ?? "w-9 text-neutral-500"
        }`}
      >
        {label}
      </span>
      {options.length === 0 ? (
        // An empty dropdown would look like a control that does not work. Say
        // which state the install is in instead.
        <span className="min-w-0 flex-1 text-[10px] text-neutral-500">
          {t("agent.defaultModels.none")}
        </span>
      ) : (
        <ModelSelect
          value={value}
          onChange={(next) => onChange(decodeRouteOption(next))}
          options={[
            {
              value: AUTOMATIC_MODEL_ROUTE,
              label: t("settings.modelRoutes.auto"),
            },
            ...options,
          ]}
          label={label}
          className="min-w-0 flex-1"
        />
      )}
    </div>
  );
}

ComposerModelRouteRow.propTypes = {
  routeId: PropTypes.string.isRequired,
  selection: PropTypes.shape({
    providerId: PropTypes.string,
    modelId: PropTypes.string,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  labelKey: PropTypes.string,
  labelClassName: PropTypes.string,
  className: PropTypes.string,
  cloudMode: PropTypes.bool,
};

/**
 * The section itself. Reads the route store on mount and follows it while it
 * is open, so the two surfaces cannot drift apart.
 */
export default function ComposerModelRoutes() {
  const { t } = useI18n();
  const [routes, setRoutes] = useState({});
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    let active = true;
    void getStoredModelRoutesAsync().then((stored) => {
      if (active) setRoutes(stored ?? {});
    });
    const unsubscribe = onSettingChange(MODEL_ROUTES_KEY, (next) => {
      setRoutes(next ?? {});
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const changeRoute = useCallback(
    async (routeId, selection) => {
      setSaveError(null);
      try {
        const saved = await setModelRoute(routeId, selection);
        setRoutes((current) => ({ ...current, [routeId]: saved }));
      } catch (cause) {
        // The route stays unwritten, so the menu has to say so — a silent
        // revert to the previous model reads as "the click did not register".
        setSaveError(cause?.message ?? t("agent.system.unknownError"));
      }
    },
    [t],
  );

  return (
    <div data-testid="agent-default-models">
      {COMPOSER_MODEL_ROUTES.map((routeId) => (
        <ComposerModelRouteRow
          key={routeId}
          routeId={routeId}
          selection={composerRouteSelection(routes, routeId)}
          onChange={(selection) => void changeRoute(routeId, selection)}
        />
      ))}
      {saveError ? (
        <p role="alert" className="px-1 pt-1 text-[10px] text-rose-300">
          {t("agent.defaultModels.saveFailed", { reason: saveError })}
        </p>
      ) : null}
    </div>
  );
}
