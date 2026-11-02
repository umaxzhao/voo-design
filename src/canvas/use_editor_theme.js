/**
 * Editor chrome theme (dark default / light option).
 *
 * The theme is a `data-theme` attribute on <html> so one stylesheet can remap
 * the chrome's neutral scale without touching every component; the setting is
 * mirrored in localStorage and read synchronously before the first paint.
 */

import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../shared/settings.js";
import { THEME_CHANGED_EVENT } from "./theme_events.js";

export const EDITOR_THEMES = Object.freeze(["dark", "light"]);
export const EDITOR_THEME_SETTING = "voo.editor.theme";

export function currentEditorTheme() {
  return getSetting(EDITOR_THEME_SETTING) === "light" ? "light" : "dark";
}

export function applyEditorTheme(theme) {
  const value = theme === "light" ? "light" : "dark";
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = value;
  }
  return value;
}

export function setEditorTheme(theme) {
  const value = applyEditorTheme(theme);
  setSetting(EDITOR_THEME_SETTING, value);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGED_EVENT, { detail: { theme: value } }),
    );
  }
  return value;
}

export function useEditorTheme() {
  const [theme, setThemeState] = useState(currentEditorTheme);
  useEffect(() => {
    applyEditorTheme(theme);
  }, [theme]);
  useEffect(() => {
    const onChange = (event) => {
      const next = event?.detail?.theme;
      if (EDITOR_THEMES.includes(next)) setThemeState(next);
    };
    window.addEventListener?.(THEME_CHANGED_EVENT, onChange);
    return () => window.removeEventListener?.(THEME_CHANGED_EVENT, onChange);
  }, []);
  return {
    theme,
    setTheme: (next) => {
      const applied = setEditorTheme(next);
      setThemeState(applied);
    },
  };
}
