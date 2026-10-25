import { useI18n } from "../use_i18n.js";
import { setLocale } from "../../shared/i18n.js";
import SettingsSection from "./settings_section.jsx";
import SettingsRow from "./settings_row.jsx";

// Language names are shown in their own language so they stay recognisable.
const LANGUAGES = [
  { code: "zh", label: "简体中文" },
  { code: "en", label: "English" },
];

/** Interface language as a row: label on the left, a two-option switch on the right. */
export default function LanguageSection() {
  const { t, locale } = useI18n();
  return (
    <SettingsSection title={t("settings.generalPreferences")} hint={t("settings.languageHint")}>
      <SettingsRow label={t("settings.language")} hint={t("settings.languageHint")}>
        <div className="flex gap-1">
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              aria-pressed={locale === code}
              onClick={() => setLocale(code)}
              className={`min-h-8 rounded-lg px-3 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                locale === code
                  ? "bg-white/[0.12] font-medium text-white"
                  : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
