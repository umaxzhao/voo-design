/** Validated session settings for Magnetic Lasso. */

import { MAGNETIC_LASSO_SETTINGS } from "./magnetic_lasso.js";

export function createMagneticLassoSettings() {
  const values = {
    width: MAGNETIC_LASSO_SETTINGS.width.defaultValue,
    contrast: MAGNETIC_LASSO_SETTINGS.contrast.defaultValue,
    frequency: MAGNETIC_LASSO_SETTINGS.frequency.defaultValue,
  };

  return Object.freeze({
    get: (name) => values[name],
    snapshot: () => ({ ...values }),
    set(name, next) {
      const definition = MAGNETIC_LASSO_SETTINGS[name];
      if (!definition) {
        throw new RangeError(`Unknown Magnetic Lasso setting: ${name}`);
      }
      const numeric = Number(next);
      values[name] = Number.isFinite(numeric)
        ? Math.max(definition.min, Math.min(definition.max, numeric))
        : definition.defaultValue;
      return values[name];
    },
  });
}
