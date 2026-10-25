import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { useI18n } from "../use_i18n.js";
import { useProviderConfigs } from "../use_provider_state.js";
import { getSettingAsync, setSetting } from "../../shared/settings.js";
import { PROVIDER_MODELS_KEY, providerModelList } from "../../shared/provider_models.js";
import { API_MEDIA_TYPE, PROVIDERS } from "../../shared/providers.js";
import { AGENT_SETTING } from "../agent/canvas_tools.js";
import SettingsSection from "./settings_section.jsx";
import SettingsRow from "./settings_row.jsx";
import FlatSelect from "./flat_select.jsx";
import { SELECT_TRIGGER_CLASS, readSetting } from "./agent_settings_shared.js";

/**
 * One model choice: a provider that has a key configured, then one of its
 * models. Keys stay in AI Providers; this only records which model to use.
 */
function ModelPicker({ label, mediaType, providerKey, modelKey, configuredIds, catalog, hint }) {
  const { t } = useI18n();
  const [providerId, setProviderId] = useState(() => readSetting(providerKey, ""));
  const [modelId, setModelId] = useState(() => readSetting(modelKey, ""));
  const providers = PROVIDERS.filter((entry) => configuredIds.includes(entry.id));
  const models = providerId ? providerModelList(catalog, providerId, mediaType) : [];

  const chooseProvider = (next) => {
    setProviderId(next);
    setModelId("");
    setSetting(providerKey, next);
    setSetting(modelKey, "");
  };

  const chooseModel = (next) => {
    setModelId(next);
    setSetting(modelKey, next);
  };

  return (
    <SettingsRow label={label} hint={hint}>
      <div className="grid w-full grid-cols-2 gap-2 sm:w-[22rem]">
        <FlatSelect
          label={`${label} · ${t("settings.assistant.provider")}`}
          value={providerId}
          onChange={chooseProvider}
          options={providers.map((entry) => ({ value: entry.id, label: entry.label }))}
          placeholder={t("settings.assistant.chooseProvider")}
          className="w-full"
          triggerClassName={SELECT_TRIGGER_CLASS}
          widthClass="w-full"
        />
        <FlatSelect
          label={`${label} · ${t("settings.assistant.model")}`}
          value={modelId}
          onChange={chooseModel}
          options={models.map((model) => ({ value: model.id, label: model.label }))}
          disabled={!providerId}
          placeholder={
            providerId && models.length === 0
              ? t("settings.assistant.noModels")
              : t("settings.assistant.chooseModel")
          }
          className="w-full"
          triggerClassName={SELECT_TRIGGER_CLASS}
          widthClass="w-full"
        />
      </div>
    </SettingsRow>
  );
}

/** The Models tab: image, text and LLM model pickers, built from providers that have a key. */
export default function AgentModelsSettings({ onOpenProviders }) {
  const { t } = useI18n();
  const { configs } = useProviderConfigs();
  const configuredIds = Object.keys(configs).filter((id) => configs[id]);
  const [catalog, setCatalog] = useState({});

  // The model catalogue is saved by AI Providers; read it once the tab opens.
  useEffect(() => {
    let active = true;
    getSettingAsync(PROVIDER_MODELS_KEY).then((stored) => {
      if (active) setCatalog(stored ?? {});
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingsSection title={t("settings.assistant.modelsTitle")} hint={t("settings.assistant.modelsHint")}>
      {configuredIds.length === 0 && (
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-400">
          <span>{t("settings.assistant.noProviders")}</span>
          <button
            type="button"
            onClick={onOpenProviders}
            className="rounded-md px-1 py-1 text-neutral-200 underline underline-offset-2 outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          >
            {t("settings.tabProviders")}
          </button>
        </div>
      )}
      <ModelPicker
        label={t("settings.assistant.imageModel")}
        mediaType={API_MEDIA_TYPE.IMAGE}
        providerKey={AGENT_SETTING.IMAGE_PROVIDER_ID}
        modelKey={AGENT_SETTING.IMAGE_MODEL_ID}
        configuredIds={configuredIds}
        catalog={catalog}
      />
      <ModelPicker
        label={t("settings.assistant.textModel")}
        mediaType={API_MEDIA_TYPE.TEXT}
        providerKey={AGENT_SETTING.TEXT_PROVIDER_ID}
        modelKey={AGENT_SETTING.TEXT_MODEL_ID}
        configuredIds={configuredIds}
        catalog={catalog}
      />
      <ModelPicker
        label={t("settings.assistant.llmModel")}
        mediaType={API_MEDIA_TYPE.TEXT}
        providerKey={AGENT_SETTING.LLM_PROVIDER_ID}
        modelKey={AGENT_SETTING.LLM_MODEL_ID}
        configuredIds={configuredIds}
        catalog={catalog}
        hint={t("settings.assistant.llmHint")}
      />
    </SettingsSection>
  );
}

AgentModelsSettings.propTypes = {
  /** Switches the drawer to the AI Providers tab. */
  onOpenProviders: PropTypes.func,
};
