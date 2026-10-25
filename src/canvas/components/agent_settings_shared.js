import { getSetting } from "../../shared/settings.js";

/** Trigger look of the settings fields, so dropdowns match the inputs beside them. */
export const SELECT_TRIGGER_CLASS = "!h-auto !min-h-9 !w-full !rounded-xl !bg-white/[0.06] !px-3 !py-2 !text-xs !text-neutral-200";

/** Reads a stored value, falling back to the default when nothing is saved. */
export function readSetting(key, fallback) {
  const value = getSetting(key);
  return value === null || value === undefined ? fallback : value;
}
