import { useEffect, useReducer, useRef } from "react";
import PropTypes from "prop-types";
import { getStoredCustomProviders, isValidCustomBaseUrl } from "../../../shared/custom_providers.js";
import { IconCheck, IconRefresh } from "../../icons.jsx";
import { getProviderErrorMessage } from "../provider_status_helpers.js";
import { fetchCustomProviderModels } from "./custom_provider_setup.js";

const FOCUS_CLASS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40";
const INPUT_CLASS = `w-full rounded-xl bg-[#191919] px-3 py-2.5 text-xs text-neutral-200 outline-none transition-colors placeholder:text-neutral-400 hover:bg-[#1d1d1d] ${FOCUS_CLASS}`;
const LABEL_CLASS = "text-[10px] uppercase tracking-wide text-neutral-500";

/** Radio list of every model a custom provider offers; picking one makes it the Agent default. */
function ModelList({ t, groups, selectedModel, onSelectModel }) {
  return (
    <div role="radiogroup" aria-label={t("firstRun.custom.models")} data-testid="first-run-custom-models"
      className="ui-scroll flex max-h-44 flex-col gap-2 overflow-y-auto">
      {groups.filter((group) => group.models.length > 0).map((group) => (
        <div key={group.cliId} className="flex flex-col gap-1">
          <span className={LABEL_CLASS}>{group.name}</span>
          {group.models.map((model) => {
            const checked = selectedModel === model.id;
            return (
              <button key={model.id} type="button" role="radio" aria-checked={checked}
                data-testid="first-run-custom-model" onClick={() => onSelectModel(model.id)}
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs text-neutral-100 transition-colors ${FOCUS_CLASS} ${checked ? "bg-white/[0.1]" : "bg-white/[0.04] hover:bg-white/[0.07]"}`}>
                <span className="min-w-0 break-words">{model.label}</span>
                {checked && <IconCheck size={12} strokeWidth={3} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

ModelList.propTypes = {
  t: PropTypes.func.isRequired,
  groups: PropTypes.arrayOf(PropTypes.shape({
    cliId: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    models: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, label: PropTypes.string.isRequired })).isRequired,
  })).isRequired,
  selectedModel: PropTypes.string.isRequired,
  onSelectModel: PropTypes.func.isRequired,
};

const INITIAL_FORM = { baseUrl: "", apiKey: "", providerId: null, savedUrl: "", loading: false, urlError: "", fetchError: "" };

function formReducer(state, action) {
  switch (action.type) {
    case "edit":
      return { ...state, [action.field]: action.value, ...(action.field === "baseUrl" ? { urlError: "" } : {}) };
    case "invalid":
      return { ...state, ...action.errors };
    case "start":
      return { ...state, loading: true, urlError: "", fetchError: "" };
    case "success":
      // The key is stored by the provider layer; it is never shown again.
      return { ...state, loading: false, apiKey: "", providerId: action.providerId, savedUrl: action.savedUrl };
    case "failure":
      return { ...state, loading: false, fetchError: action.message };
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

/**
 * Inline custom-provider setup under the first-run agent grid: endpoint, key,
 * "Fetch models", then a list to pick the default model.
 */
export default function CustomProviderInline({ t, groups, selectedModel, onSelectModel, onConfigured, preset = null }) {
  const section = useRef(null);
  const savedProvider = preset ? getStoredCustomProviders().find(provider => provider.id === preset.customProviderId) : null;
  const [form, dispatch] = useReducer(formReducer, {
    ...INITIAL_FORM,
    baseUrl: savedProvider?.defaultBaseUrl ?? preset?.baseUrl ?? "",
    // A preset with a placeholder key (the loopback DSH bridge) fills it in so
    // "Fetch models" works immediately; the field stays editable. A key already
    // stored for a previously configured provider is never shown again.
    apiKey: savedProvider ? "" : preset?.presetApiKey ?? "",
    providerId: savedProvider?.id ?? null,
    savedUrl: savedProvider?.defaultBaseUrl ?? "",
  });
  const { baseUrl, apiKey, providerId, savedUrl, loading, urlError, fetchError } = form;

  // The section is taller than the visible column once the model list appears.
  useEffect(() => { section.current?.scrollIntoView?.({ block: "nearest" }); }, []);

  const fetchModels = async () => {
    const url = baseUrl.trim();
    if (!isValidCustomBaseUrl(url)) {
      dispatch({ type: "invalid", errors: { urlError: t("settings.customProvider.baseUrlInvalid"), fetchError: "" } });
      return;
    }
    if (!apiKey.trim() && (!providerId || url !== savedUrl)) {
      dispatch({ type: "invalid", errors: { urlError: "", fetchError: t(providerId ? "error.providerKeyRequiredForBaseUrlChange" : "error.providerKeyRequired") } });
      return;
    }
    dispatch({ type: "start" });
    try {
      const result = await fetchCustomProviderModels({ providerId, baseUrl: url, apiKey,
        ...(preset ? { name: t(preset.labelKey), newProviderId: preset.customProviderId } : {}),
      });
      dispatch({ type: "success", providerId: result.providerId, savedUrl: url });
      onConfigured();
    } catch (error) {
      dispatch({ type: "failure", message: getProviderErrorMessage(t, error.code ?? "providerRequestFailed") });
    }
  };

  return (
    <section ref={section} data-testid="first-run-custom-config" aria-label={t(preset?.labelKey ?? "firstRun.provider.custom")}
      className="flex flex-col gap-3 rounded-2xl bg-white/[0.04] p-4">
      {preset?.hintKey ? (
        <p data-testid="first-run-custom-hint" className="text-[10px] leading-4 text-neutral-400">{t(preset.hintKey)}</p>
      ) : null}
      <label className="flex flex-col gap-1.5">
        <span className={LABEL_CLASS}>{t("settings.customProvider.baseUrl")}</span>
        <input type="url" data-testid="first-run-custom-url" value={baseUrl}
          onChange={(event) => dispatch({ type: "edit", field: "baseUrl", value: event.target.value })}
          placeholder={t("settings.customProvider.baseUrlPlaceholder")}
          autoComplete="off" spellCheck={false} className={INPUT_CLASS} />
        {urlError && <span data-testid="first-run-custom-url-error" className="text-[10px] text-rose-400">{urlError}</span>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL_CLASS}>{providerId ? t("provider.replaceKey") : t("provider.apiKey")}</span>
        <input type="password" data-testid="first-run-custom-key" value={apiKey}
          onChange={(event) => dispatch({ type: "edit", field: "apiKey", value: event.target.value })}
          placeholder={t("provider.apiKeyHint")} autoComplete="off" spellCheck={false} className={INPUT_CLASS} />
      </label>
      <div className="flex flex-col gap-1.5">
        <button type="button" data-testid="first-run-custom-fetch" onClick={fetchModels}
          disabled={loading} aria-busy={loading}
          className={`flex w-fit items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-neutral-100 transition-colors hover:bg-white/[0.14] disabled:opacity-40 disabled:pointer-events-none ${FOCUS_CLASS}`}>
          <IconRefresh size={12} className={loading ? "animate-spin" : undefined} />
          {t(loading ? "firstRun.custom.fetching" : "firstRun.custom.fetch")}
        </button>
        {fetchError && <span role="alert" data-testid="first-run-custom-error" className="text-[10px] text-rose-400">{fetchError}</span>}
      </div>
      {groups.some((group) => group.models.length > 0) && (
        <ModelList t={t} groups={groups} selectedModel={selectedModel} onSelectModel={onSelectModel} />
      )}
    </section>
  );
}

CustomProviderInline.propTypes = {
  t: PropTypes.func.isRequired,
  groups: ModelList.propTypes.groups,
  selectedModel: PropTypes.string.isRequired,
  onSelectModel: PropTypes.func.isRequired,
  onConfigured: PropTypes.func.isRequired,
  preset: PropTypes.shape({
    customProviderId: PropTypes.string.isRequired,
    baseUrl: PropTypes.string.isRequired,
    labelKey: PropTypes.string.isRequired,
    presetApiKey: PropTypes.string,
    hintKey: PropTypes.string,
  }),
};
