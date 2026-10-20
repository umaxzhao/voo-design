/**
 * Runtime i18n — English and Simplified Chinese.
 *
 * The locale follows an explicit user choice (`ciw.locale`) when there is one,
 * otherwise the system language: a Chinese system gets Chinese, everything
 * else English. See `resolveInitialLocale`.
 *
 * Dictionaries load on demand (plan 4.2): the entry chunk no longer bundles
 * the translation tables, saving ~13–20 KB. `loadLocale` populates the
 * in-memory table; until it resolves, `t()` falls back to the key — a window
 * that is effectively zero because main.jsx loads the initial locale before
 * the first render.
 */

/** Locales that ship a dictionary. */
export const SUPPORTED_LOCALES = ["en", "zh"];

/**
 * Picks the locale to start in. A stored supported choice wins; a page driven
 * by browser automation (`navigator.webdriver`) starts in English so the
 * verify scripts' text assertions do not depend on the machine's locale;
 * otherwise the first system language tag we ship a dictionary for (any
 * `zh-*` tag, Hans or Hant, maps to `zh`); otherwise English.
 */
export function resolveInitialLocale({ stored, languages, automated } = {}) {
  if (SUPPORTED_LOCALES.includes(stored)) return stored;
  if (automated) return "en";
  for (const tag of languages ?? []) {
    const primary = String(tag).toLowerCase().split(/[-_]/)[0];
    if (SUPPORTED_LOCALES.includes(primary)) return primary;
  }
  return "en";
}

/** The loaded tables; keys are locale codes. */
const DICTIONARIES = {};
const FULL_LOADED = {};
let activeLocale = "en";
const listeners = new Set();

/**
 * Loads the critical initial-paint slice of a dictionary so the initial frame
 * renders without waiting for the full ~130KB dictionary over the wire.
 */
export async function loadCriticalLocale(locale) {
  activeLocale = locale;
  if (FULL_LOADED[locale] || DICTIONARIES[locale]) {
    return DICTIONARIES[locale];
  }
  try {
    const module = await import(`./i18n/core-${locale}.js`);
    DICTIONARIES[locale] = {
      ...(DICTIONARIES[locale] ?? {}),
      ...(module.default ?? {}),
    };
  } catch {
    // If core slice fails or is missing, fallback to full load
    await loadLocale(locale);
  }
  return DICTIONARIES[locale];
}

/**
 * Loads a locale's complete dictionary and makes it the active table. Idempotent
 * per locale. Resolves with the dictionary, or rejects on a missing locale.
 */
export async function loadLocale(locale) {
  activeLocale = locale;
  if (FULL_LOADED[locale]) {
    return DICTIONARIES[locale];
  }
  const module = await import(`./i18n/${locale}.js`);
  DICTIONARIES[locale] = {
    ...(DICTIONARIES[locale] ?? {}),
    ...(module.default ?? {}),
  };
  FULL_LOADED[locale] = true;
  listeners.forEach((listener) => {
    try {
      listener(activeLocale);
    } catch {
      // ignore listener errors
    }
  });
  return DICTIONARIES[locale];
}

/**
 * Translates a key, interpolating `{name}` placeholders.
 * Unknown keys fall back to the key itself so missing strings stay visible.
 */
export function t(key, params) {
  const template =
    DICTIONARIES[activeLocale]?.[key] ?? DICTIONARIES.en?.[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match,
  );
}

/** Returns the active locale. */
export function getLocale() {
  return activeLocale;
}

/** Loads the locale's dictionary and switches the active locale. */
export function setLocale(locale) {
  if (!locale) return Promise.resolve();
  return loadLocale(locale)
    .then(() => {
      listeners.forEach((listener) => {
        try {
          listener(activeLocale);
        } catch {
          // ignore listener errors
        }
      });
    })
    .catch(() => {
      // Ignore load error, keep current locale
    });
}

/** Toggles between English and Simplified Chinese. */
export function toggleLocale() {
  const next = activeLocale === "zh" ? "en" : "zh";
  setLocale(next);
}

/** Subscribes to locale changes. */
export function onLocaleChange(listener) {
  if (typeof listener === "function") {
    listeners.add(listener);
  }
  return () => listeners.delete(listener);
}
