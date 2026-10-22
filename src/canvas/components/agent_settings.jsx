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
import SettingsSection, { SETTINGS_INPUT_CLASS } from "./settings_section.jsx";
import FlatSelect from "./flat_select.jsx";

/** Trigger look of the settings fields, so dropdowns match the inputs beside them. */
const SELECT_TRIGGER_CLASS = "!h-auto !min-h-12 !w-full !rounded-xl !bg-white/[0.06] !px-3 !py-2 !text-xs !text-neutral-200";

const MIN_STEPS = 4;
const MAX_STEPS = 16;

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
    <div className="flex flex-col gap-2">
      <span className="text-[12px] text-neutral-300">{label}</span>
      {hint && <span className="text-[11px] text-neutral-500">{hint}</span>}
      <div className="grid grid-cols-2 gap-2">
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
    </div>
  );
}

/** Agent behaviour. Provider keys live in AI Providers; models are chosen here from them. */
export default function AgentSettings() {
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
      <SettingsSection title={t("settings.assistant.modelsTitle")} hint={t("settings.assistant.modelsHint")}>
        {configuredIds.length === 0 && (
          <p className="text-[12px] text-neutral-400">{t("settings.assistant.noProviders")}</p>
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
        <label className="flex items-center justify-between gap-4">
          <span className="text-[12px] text-neutral-300">{t("settings.assistant.confirmBeforeImage")}</span>
          <input
            type="checkbox"
            checked={confirmBeforeImage}
            onChange={(event) =>
              toggle(AGENT_SETTING.CONFIRM_BEFORE_IMAGE, event.target.checked, setConfirmBeforeImage)
            }
            className="size-4 accent-[#a7ffd4]"
          />
        </label>

        <label className="flex items-center justify-between gap-4">
          <span className="text-[12px] text-neutral-300">{t("settings.assistant.useSelection")}</span>
          <input
            type="checkbox"
            checked={useSelection}
            onChange={(event) =>
              toggle(AGENT_SETTING.USE_SELECTION_BY_DEFAULT, event.target.checked, setUseSelection)
            }
            className="size-4 accent-[#a7ffd4]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-neutral-300">{t("settings.assistant.imageSize")}</span>
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
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-neutral-300">
            {t("settings.assistant.maxSteps")} ({MIN_STEPS}–{MAX_STEPS})
          </span>
          <input
            type="number"
            min={MIN_STEPS}
            max={MAX_STEPS}
            value={maxSteps}
            onChange={(event) => {
              const next = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Number(event.target.value) || MIN_STEPS));
              setMaxSteps(next);
              save(AGENT_SETTING.MAX_STEPS, next);
            }}
            className={SETTINGS_INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-neutral-300">{t("settings.assistant.styleNote")}</span>
          <textarea
            rows={3}
            value={styleNote}
            placeholder={t("settings.assistant.styleNotePlaceholder")}
            onChange={(event) => setStyleNote(event.target.value)}
            onBlur={() => save(AGENT_SETTING.STYLE_NOTE, styleNote.trim())}
            className={SETTINGS_INPUT_CLASS}
          />
        </label>
      </SettingsSection>
    </>
  );
}
