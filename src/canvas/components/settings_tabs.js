import { Keyboard as IconKeyboard } from "lucide-react";
import { IconPalette, IconServer, IconSliders, IconSparkles } from "../icons.jsx";

/**
 * Settings drawer tabs in display order. The design-systems tab is not first.
 * Every tab has its own icon and an i18n label key (never inline text).
 */
export const SETTINGS_TABS = [
  { id: "general", labelKey: "settings.tabPreferences", icon: IconSliders },
  { id: "assistant", labelKey: "settings.tabAssistant", icon: IconSparkles },
  { id: "design-systems", labelKey: "settings.tabDesignSystems", icon: IconPalette },
  { id: "providers", labelKey: "settings.tabProviders", icon: IconServer },
  { id: "shortcuts", labelKey: "settings.tabShortcuts", icon: IconKeyboard },
];
