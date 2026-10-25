import { useCallback, useEffect, useState } from "react";
import { onSettingChange } from "../../shared/settings.js";
import {
  CUSTOM_DESIGN_SYSTEMS_SETTING,
  loadCustomDesignSystems,
  normalizeCustomDesignSystems,
  saveCustomDesignSystems,
} from "../editor/design_system_registry.js";

/** User-created design systems, kept in sync with the shared settings store. */
export function useCustomDesignSystems() {
  const [custom, setCustom] = useState(loadCustomDesignSystems);
  useEffect(
    () =>
      onSettingChange(CUSTOM_DESIGN_SYSTEMS_SETTING, (value) =>
        setCustom(normalizeCustomDesignSystems(value)),
      ),
    [],
  );
  /** Resolves once storage accepted the list; rejects if persistence failed. */
  const commit = useCallback(async (next) => {
    setCustom(next);
    await saveCustomDesignSystems(next);
  }, []);
  return [custom, commit];
}
