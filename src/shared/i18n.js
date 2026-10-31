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

// Vite can replace this module while mounted React components still hold its
// exports. Share the complete state with the replacement, including subscribers
// and request ordering, so neither old nor new consumers lose their dictionary.
const previousState = import.meta.hot?.data.localeState;
const state = previousState ?? {
  dictionaries: {},
  fullLoaded: {},
  pendingCore: new Map(),
  pendingFull: new Map(),
  activeLocale: "en",
  requestedLocale: "en",
  requestId: 0,
  generation: 0,
  listeners: new Set(),
};

function validateLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
}

function notifyListeners() {
  for (const listener of [...state.listeners]) {
    try {
      listener(state.activeLocale);
    } catch (error) {
      console.error("[i18n] Locale listener failed.", error);
    }
  }
}

function mergeDictionary(locale, dictionary) {
  state.dictionaries[locale] = { ...state.dictionaries[locale], ...dictionary };
  if (state.activeLocale === locale) notifyListeners();
  return state.dictionaries[locale];
}

function ensureFullLocale(locale) {
  if (state.fullLoaded[locale]) return Promise.resolve(state.dictionaries[locale]);
  if (state.pendingFull.has(locale)) return state.pendingFull.get(locale);
  const generation = state.generation;
  const pending = import(`./i18n/${locale}.js`).then((module) => {
    // A response started by a replaced module cannot overwrite newer strings.
    if (generation !== state.generation) return state.dictionaries[locale];
    state.fullLoaded[locale] = true;
    return mergeDictionary(locale, module.default);
  }).finally(() => {
    if (state.pendingFull.get(locale) === pending) state.pendingFull.delete(locale);
  });
  state.pendingFull.set(locale, pending);
  return pending;
}

function ensureCriticalLocale(locale) {
  if (state.dictionaries[locale]) return Promise.resolve(state.dictionaries[locale]);
  if (state.pendingCore.has(locale)) return state.pendingCore.get(locale);
  const generation = state.generation;
  const pending = import(`./i18n/core-${locale}.js`).then((module) => {
    // A late critical slice must never overwrite the full dictionary.
    if (generation !== state.generation || state.fullLoaded[locale]) return state.dictionaries[locale];
    return mergeDictionary(locale, module.default);
  }).catch((error) => {
    console.warn(`[i18n] Critical dictionary failed for "${locale}"; loading the full dictionary.`, error);
    return ensureFullLocale(locale);
  }).finally(() => {
    if (state.pendingCore.get(locale) === pending) state.pendingCore.delete(locale);
  });
  state.pendingCore.set(locale, pending);
  return pending;
}

function activateLocale(locale, requestId) {
  if (requestId !== state.requestId || state.activeLocale === locale) return;
  state.activeLocale = locale;
  notifyListeners();
}

/** Keep the current language usable until its replacement has loaded. */
export async function loadCriticalLocale(locale) {
  validateLocale(locale);
  state.requestedLocale = locale;
  const requestId = ++state.requestId;
  const dictionary = await ensureCriticalLocale(locale);
  activateLocale(locale, requestId);
  return dictionary;
}

/** Load once per locale; only the latest requested language can become active. */
export async function loadLocale(locale) {
  validateLocale(locale);
  state.requestedLocale = locale;
  const requestId = ++state.requestId;
  const dictionary = await ensureFullLocale(locale);
  activateLocale(locale, requestId);
  return dictionary;
}

/** Retry deferred loading on component mount without changing language intent. */
export function ensureCurrentLocale() {
  return ensureFullLocale(state.requestedLocale);
}

/** Translate and interpolate; genuinely unknown keys remain visible for diagnosis. */
export function t(key, params) {
  const template = state.dictionaries[state.activeLocale]?.[key] ?? state.dictionaries.en?.[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function getLocale() {
  return state.activeLocale;
}

export async function setLocale(locale) {
  if (!locale) return;
  if (!SUPPORTED_LOCALES.includes(locale)) {
    console.warn(`[i18n] Ignoring unsupported locale: ${locale}`);
    return;
  }
  try {
    return await loadLocale(locale);
  } catch (error) {
    console.warn(`[i18n] Failed to load locale "${locale}"; keeping the current locale.`, error);
  }
}

export function toggleLocale() {
  return setLocale(state.requestedLocale === "zh" ? "en" : "zh");
}

export function onLocaleChange(listener) {
  if (typeof listener !== "function") return () => {};
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

if (import.meta.hot) {
  import.meta.hot.data.localeState = state;
  import.meta.hot.accept();
  if (previousState) {
    // Retain readable cached strings while fetching updated dictionaries.
    state.generation += 1;
    state.fullLoaded = {};
    state.pendingCore.clear();
    state.pendingFull.clear();
    void ensureCurrentLocale().catch((error) => {
      console.warn("[i18n] Updated dictionary failed to load; keeping cached translations.", error);
    });
  }
}
