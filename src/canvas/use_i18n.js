import { useEffect, useState } from "react";
import { getLocale, onLocaleChange, t, toggleLocale } from "../shared/i18n.js";

/**
 * Subscribes a component to locale changes. Returns the translate function so
 * call sites read as `const { t } = useI18n()`.
 */
export function useI18n() {
  const [locale, setLocaleState] = useState(getLocale);

  useEffect(() => onLocaleChange(setLocaleState), []);

  return { t, locale, toggleLocale };
}
