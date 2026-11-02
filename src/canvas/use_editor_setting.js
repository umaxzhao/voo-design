/**
 * One persisted editor preference as React state, kept in sync across the
 * settings drawer and the editor via a window event. Used by small toggles
 * whose value is read by hooks outside the settings dialog.
 */

import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../shared/settings.js";

export const SETTING_CHANGED_EVENT = "voo:setting-changed";
export const EDITOR_AUTOSAVE_SETTING = "voo.editor.autoSaveDrafts";

export function updateEditorSetting(key, value) {
  setSetting(key, value);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SETTING_CHANGED_EVENT, { detail: { key, value } }),
    );
  }
  return value;
}

export function useEditorSetting(key, fallback = undefined) {
  const [value, setValue] = useState(() => {
    const stored = getSetting(key);
    return stored === undefined ? fallback : stored;
  });
  useEffect(() => {
    const onChange = (event) => {
      if (event?.detail?.key && event.detail.key !== key) return;
      const stored = getSetting(key);
      setValue(stored === undefined ? fallback : stored);
    };
    window.addEventListener?.(SETTING_CHANGED_EVENT, onChange);
    return () => window.removeEventListener?.(SETTING_CHANGED_EVENT, onChange);
  }, [key, fallback]);
  return value;
}
