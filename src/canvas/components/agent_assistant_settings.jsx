import { useState } from "react";
import { useI18n } from "../use_i18n.js";
import { setSetting } from "../../shared/settings.js";
import { AGENT_DEFAULTS, AGENT_SETTING, IMAGE_SIZE_PRESETS } from "../agent/canvas_tools.js";
import SettingsSection, { SETTINGS_INPUT_CLASS, SettingsField } from "./settings_section.jsx";
import SettingsRow from "./settings_row.jsx";
import { Switch } from "./ui/switch.jsx";
import FlatSelect from "./flat_select.jsx";
import { SELECT_TRIGGER_CLASS, readSetting } from "./agent_settings_shared.js";

const MIN_STEPS = 4;
const MAX_STEPS = 128;

/** The Assistant tab: confirm before image, selection, image size, max steps and style note. */
export default function AgentAssistantSettings() {
  const { t } = useI18n();
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

  const save = (key, value) => setSetting(key, value);

  const toggle = (key, value, setValue) => {
    setValue(value);
    save(key, value);
  };

  return (
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
  );
}
