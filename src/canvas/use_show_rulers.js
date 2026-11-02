import { useCallback, useEffect, useState } from "react";
import { getSetting, onSettingChange, setSetting } from "../shared/settings.js";

export const SHOW_RULERS_SETTING = "voo.editor.showRulers";

// Only an explicit opt-in enables rulers, including after settings hydration.
export function useShowRulers() {
  const [showRulers, setShowRulers] = useState(
    () => getSetting(SHOW_RULERS_SETTING) === true,
  );
  useEffect(() => {
    const unsubscribe = onSettingChange(SHOW_RULERS_SETTING, (value) => {
      setShowRulers(value === true);
    });
    setShowRulers(getSetting(SHOW_RULERS_SETTING) === true);
    return unsubscribe;
  }, []);
  const update = useCallback((value) => {
    void setSetting(SHOW_RULERS_SETTING, value === true);
  }, []);
  const toggle = useCallback(() => {
    void setSetting(SHOW_RULERS_SETTING, getSetting(SHOW_RULERS_SETTING) !== true);
  }, []);
  return { showRulers, setShowRulers: update, toggleRulers: toggle };
}
