import { useEffect, useState } from "react";
import { ensureCurrentLocale, getLocale, onLocaleChange, t, toggleLocale } from "../shared/i18n.js";

/**
 * Subscribes a component to locale changes. Returns the translate function so
 * call sites read as `const { t } = useI18n()`.
 */
export function useI18n() {
  const [locale, setLocaleState] = useState(getLocale);
  // The full dictionary can finish loading after first paint without changing
  // the locale name, so a plain setState would bail out and keep raw keys on
  // screen. Bump a counter on every notification to force a re-render.
  const [, setRevision] = useState(0);

  useEffect(() => {
    const refresh = (next) => {
      setLocaleState(next);
      setRevision((revision) => revision + 1);
    };
    const unsubscribe = onLocaleChange(refresh);
    // A dictionary may resolve between render and effect subscription.
    refresh(getLocale());
    void ensureCurrentLocale().catch((error) => {
      console.warn("[i18n] Deferred dictionary is unavailable; keeping current translations.", error);
    });
    return unsubscribe;
  }, []);

  return { t, locale, toggleLocale };
}
