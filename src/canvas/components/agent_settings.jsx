import PropTypes from "prop-types";
import AgentMcpSettings from "./agent_mcp_settings.jsx";
import { useEffect, useState } from "react";
import { useI18n } from "../use_i18n.js";
import { useProviderConfigs } from "../use_provider_state.js";
import { getSetting, getSettingAsync, setSetting } from "../../shared/settings.js";
import { PROVIDER_MODELS_KEY, providerModelList } from "../../shared/provider_models.js";
import { API_MEDIA_TYPE, PROVIDERS } from "../../shared/providers.js";
import {
  AGENT_DEFAULTS,
  AGENT_SETTING,
  IMAGE_SIZE_PRESETS,
} from "../agent/canvas_tools.js";
import SettingsSection, { SETTINGS_INPUT_CLASS, SettingsField } from "./settings_section.jsx";
import SettingsRow from "./settings_row.jsx";
import { Switch } from "./ui/switch.jsx";
import FlatSelect from "./flat_select.jsx";

/** Trigger look of the settings fields, so dropdowns match the inputs beside them. */
const SELECT_TRIGGER_CLASS = "!h-auto !min-h-9 !w-full !rounded-xl !bg-white/[0.06] !px-3 !py-2 !text-xs !text-neutral-200";

const MIN_STEPS = 4;
const MAX_STEPS = 128;

/** Reads a stored value, falling back to the default when nothing is saved. */
function readSetting(key, fallback) {
  const value = getSetting(key);
  return value === null || value === undefined ? fallback : value;
}

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

/** Agent behaviour. Provider keys live in AI Providers; models are chosen here from them. */
export default function AgentSettings({ onOpenProviders }) {
  const { t } = useI18n();
  const { configs } = useProviderConfigs();
  const configuredIds = Object.keys(configs).filter((id) => configs[id]);
  const [catalog, setCatalog] = useState({});
  const [confirmBeforeImage, setConfirmBeforeImage] = useState(() =>
    readSetting(AGENT_SETTING.CONFIRM_BEFORE_IMAGE, AGENT_DEFAULTS.confirmBeforeImage),
  );
  const [useSelection, setUseSelection] = useState(() =>
    readSetting(AGENT_SETTING.USE_SELECTION_BY_DEFAULT, AGENT_DEFAULTS.useSelectionByDefault),
  );
  const [imageSize, setImageSize] = useState(() =>
    readSetting(AGENT_SETTING.DEFAULT_IMAGE_SIZE, AGENT_DEFAULTS.defaultImageSize),
  );
  const [maxSteps, setMaxSteps] = useState(() =>
    readSetting(AGENT_SETTING.MAX_STEPS, AGENT_DEFAULTS.maxSteps),
  );
  const [styleNote, setStyleNote] = useState(() =>
    readSetting(AGENT_SETTING.STYLE_NOTE, AGENT_DEFAULTS.styleNote),
  );

  // The model catalogue is saved by AI Providers; read it once the page opens.
  useEffect(() => {
    let active = true;
    getSettingAsync(PROVIDER_MODELS_KEY).then((stored) => {
      if (active) setCatalog(stored ?? {});
    });
    return () => {
      active = false;
    };
  }, []);

  const save = (key, value) => setSetting(key, value);

  const toggle = (key, value, setValue) => {
    setValue(value);
    save(key, value);
  };

  return (
    <>
      <AgentMcpSettings />
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

      <SettingsSection title={t("settings.assistant.title")} hint={t("settings.assistant.hint")}>
        <SettingsRow label={t("settings.assistant.confirmBeforeImage")}>
          <Switch
            label={t("settings.assistant.confirmBeforeImage")}
            checked={confirmBeforeImage}
            onChange={(next) => toggle(AGENT_SETTING.CONFIRM_BEFORE_IMAGE, next, setConfirmBeforeImage)}
          />
        </SettingsRow>

        <SettingsRow label={t("settings.assistant.useSelection")}>
          <Switch
            label={t("settings.assistant.useSelection")}
            checked={useSelection}
            onChange={(next) => toggle(AGENT_SETTING.USE_SELECTION_BY_DEFAULT, next, setUseSelection)}
          />
        </SettingsRow>

        <SettingsRow label={t("settings.assistant.imageSize")}>
          <div className="w-40">
            <FlatSelect
              label={t("settings.assistant.imageSize")}
              value={imageSize}
              onChange={(next) => {
                setImageSize(next);
                save(AGENT_SETTING.DEFAULT_IMAGE_SIZE, next);
              }}
              options={IMAGE_SIZE_PRESETS.map((size) => ({ value: size, label: size }))}
              className="w-full"
              triggerClassName={SELECT_TRIGGER_CLASS}
              widthClass="w-full"
            />
          </div>
        </SettingsRow>

        <SettingsRow label={`${t("settings.assistant.maxSteps")} (${MIN_STEPS}–${MAX_STEPS})`}>
          <input
            type="number"
            aria-label={t("settings.assistant.maxSteps")}
            min={MIN_STEPS}
            max={MAX_STEPS}
            value={maxSteps}
            onChange={(event) => {
              const next = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Number(event.target.value) || MIN_STEPS));
              setMaxSteps(next);
              save(AGENT_SETTING.MAX_STEPS, next);
            }}
            className={`${SETTINGS_INPUT_CLASS} !w-24`}
          />
        </SettingsRow>

        <SettingsField label={t("settings.assistant.styleNote")}>
          <textarea
            rows={2}
            value={styleNote}
            placeholder={t("settings.assistant.styleNotePlaceholder")}
            onChange={(event) => setStyleNote(event.target.value)}
            onBlur={() => save(AGENT_SETTING.STYLE_NOTE, styleNote.trim())}
            className={SETTINGS_INPUT_CLASS}
          />
        </SettingsField>
      </SettingsSection>
    </>
  );
}

AgentSettings.propTypes = {
  /** Switches the drawer to the AI Providers tab. */
  onOpenProviders: PropTypes.func,
};
