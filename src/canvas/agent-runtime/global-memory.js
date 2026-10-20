/**
 * Global Memory — cross-project brand library and user preferences.
 *
 * Provides pure logic for managing cross-project brands and user preferences,
 * schema migration, authorization boundaries, resolution of referenced brands,
 * and system prompt formatting. Pure runtime logic — zero React dependencies.
 *
 * @module agent-runtime/global-memory
 */

import { getSetting, setSetting } from "../../shared/settings.js";

export const GLOBAL_MEMORY_SCHEMA_VERSION = 1;
export const GLOBAL_BRANDS_STORAGE_KEY = "voo.globalMemory.brands";
export const GLOBAL_PREFERENCES_STORAGE_KEY = "voo.globalMemory.preferences";

export const PREFERENCE_KINDS = Object.freeze(["style", "workflow", "tone"]);
export const DEFAULT_PREFERENCES_LIMIT = 5;

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalizes a brand object to schema v1. */
export function sanitizeBrand(raw = {}) {
  if (!raw || typeof raw !== "object") return createEmptyBrand();

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : generateId("brand");
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Unnamed Brand";

  const rawColors = Array.isArray(raw.colors) ? raw.colors : [];
  const colors = rawColors
    .filter((c) => c && (typeof c === "string" || typeof c.hex === "string"))
    .map((c) => typeof c === "string" ? { hex: c.trim(), role: "" } : {
      hex: String(c.hex || "").trim(),
      role: String(c.role || "").trim(),
    })
    .filter((c) => Boolean(c.hex));

  const rawFonts = Array.isArray(raw.fonts) ? raw.fonts : [];
  const fonts = rawFonts
    .filter((f) => f && (typeof f === "string" || typeof f.family === "string"))
    .map((f) => typeof f === "string" ? { family: f.trim(), role: "" } : {
      family: String(f.family || "").trim(),
      role: String(f.role || "").trim(),
    })
    .filter((f) => Boolean(f.family));

  const logoAssetId = typeof raw.logoAssetId === "string" && raw.logoAssetId.trim() ? raw.logoAssetId.trim() : null;

  let safeArea = null;
  if (raw.safeArea && typeof raw.safeArea === "object") {
    safeArea = {
      top: Math.max(0, Number(raw.safeArea.top) || 0),
      right: Math.max(0, Number(raw.safeArea.right) || 0),
      bottom: Math.max(0, Number(raw.safeArea.bottom) || 0),
      left: Math.max(0, Number(raw.safeArea.left) || 0),
    };
  }

  const forbidden = (Array.isArray(raw.forbidden) ? raw.forbidden : [])
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());

  const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now();
  const rawSource = raw.source && typeof raw.source === "object" ? raw.source : {};
  const source = {
    projectId: typeof rawSource.projectId === "string" ? rawSource.projectId.trim() : null,
    projectName: typeof rawSource.projectName === "string" ? rawSource.projectName.trim() : null,
    runId: typeof rawSource.runId === "string" ? rawSource.runId.trim() : null,
    messageExcerpt: typeof rawSource.messageExcerpt === "string" ? rawSource.messageExcerpt.trim() : null,
  };

  return { id, name, colors, fonts, logoAssetId, safeArea, forbidden, createdAt, updatedAt, source };
}

/** Creates an empty brand object. */
export function createEmptyBrand(props = {}) {
  return sanitizeBrand({
    name: "New Brand",
    colors: [],
    fonts: [],
    logoAssetId: null,
    safeArea: null,
    forbidden: [],
    ...props,
  });
}

/** Migrates a raw list of global brands. */
export function migrateGlobalBrands(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeBrand).filter(Boolean);
}

/** Adds a brand to the brand list (pure function). */
export function addBrand(brands, brandData) {
  const current = migrateGlobalBrands(brands);
  return [...current, sanitizeBrand(brandData)];
}

/** Updates an existing brand (pure function). */
export function updateBrand(brands, id, patch) {
  const current = migrateGlobalBrands(brands);
  return current.map((b) => (b.id !== id ? b : sanitizeBrand({
    ...b,
    ...patch,
    id: b.id,
    createdAt: b.createdAt,
    updatedAt: Date.now(),
  })));
}

/** Removes a brand by ID (pure function). */
export function removeBrand(brands, id) {
  return migrateGlobalBrands(brands).filter((b) => b.id !== id);
}

/**
 * Resolves the effective brand for a project.
 * Project brief overrides referenced brand when conflicts occur.
 */
export function resolveEffectiveBrand(projectBrief, globalBrands = []) {
  if (!projectBrief) return null;
  const briefBrand = projectBrief.brand || {};
  const brandRefId = projectBrief.brandRefId;
  if (!brandRefId) return briefBrand;

  const referenced = globalBrands.find((b) => b.id === brandRefId);
  if (!referenced) return briefBrand;

  const hasColorsOverride = Array.isArray(briefBrand.colors) && briefBrand.colors.length > 0;
  const hasFontsOverride = Array.isArray(briefBrand.fonts) && briefBrand.fonts.length > 0;
  const hasLogoOverride = Boolean(briefBrand.logoAssetId);
  const hasSafeAreaOverride = Boolean(briefBrand.safeArea);
  const hasForbiddenOverride = Array.isArray(briefBrand.forbidden) && briefBrand.forbidden.length > 0;

  const hasOverrides = hasColorsOverride || hasFontsOverride || hasLogoOverride || hasSafeAreaOverride || hasForbiddenOverride;

  return {
    ...referenced,
    name: referenced.name,
    referencedBrandId: referenced.id,
    referencedBrandName: referenced.name,
    hasOverrides,
    colors: hasColorsOverride ? briefBrand.colors : referenced.colors,
    fonts: hasFontsOverride ? briefBrand.fonts : referenced.fonts,
    logoAssetId: hasLogoOverride ? briefBrand.logoAssetId : referenced.logoAssetId,
    safeArea: hasSafeAreaOverride ? briefBrand.safeArea : referenced.safeArea,
    forbidden: Array.from(new Set([...(referenced.forbidden || []), ...(briefBrand.forbidden || [])])),
  };
}

/** Normalizes a user preference item. */
export function createPreferenceItem(raw = {}) {
  if (!raw || typeof raw !== "object") return null;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return null;

  const kind = PREFERENCE_KINDS.includes(raw.kind) ? raw.kind : "style";
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : generateId("pref");
  const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Date.now();
  const rawSource = raw.source && typeof raw.source === "object" ? raw.source : {};
  const source = {
    projectId: typeof rawSource.projectId === "string" ? rawSource.projectId.trim() : null,
    projectName: typeof rawSource.projectName === "string" ? rawSource.projectName.trim() : null,
    runId: typeof rawSource.runId === "string" ? rawSource.runId.trim() : null,
    messageExcerpt: typeof rawSource.messageExcerpt === "string" ? rawSource.messageExcerpt.trim() : null,
  };
  return { id, text, kind, source, createdAt };
}

/** Migrates a raw list of global user preferences. */
export function migrateGlobalPreferences(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(createPreferenceItem).filter(Boolean);
}

/** Adds a preference item (pure function). */
export function addPreference(preferences, prefData) {
  const current = migrateGlobalPreferences(preferences);
  const newItem = createPreferenceItem(prefData);
  if (!newItem) return current;
  const exists = current.some(
    (p) => p.text.toLowerCase() === newItem.text.toLowerCase() && p.kind === newItem.kind,
  );
  if (exists) return current;
  return [...current, newItem];
}

/** Removes a preference item by ID (pure function). */
export function removePreference(preferences, id) {
  return migrateGlobalPreferences(preferences).filter((p) => p.id !== id);
}

/** Selects top N global preferences matching optional query. */
export function selectGlobalPreferences(preferences, query = "", limit = DEFAULT_PREFERENCES_LIMIT) {
  const current = migrateGlobalPreferences(preferences);
  if (current.length === 0) return [];
  const maxItems = typeof limit === "number" && limit > 0 ? limit : DEFAULT_PREFERENCES_LIMIT;

  if (!query || typeof query !== "string" || !query.trim()) {
    return [...current].sort((a, b) => b.createdAt - a.createdAt).slice(0, maxItems);
  }

  const q = query.toLowerCase();
  const scored = current.map((p) => ({ item: p, score: p.text.toLowerCase().includes(q) ? 10 : 0 }));
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.item.createdAt - a.item.createdAt));
  return scored.slice(0, maxItems).map((s) => s.item);
}

/** Validates a brand object against canonical schema. */
export function validateBrand(brand) {
  const errors = [];
  if (!brand || typeof brand !== "object" || Array.isArray(brand)) {
    return { valid: false, errors: ["Brand must be an object"] };
  }
  if (!brand.name || typeof brand.name !== "string" || !brand.name.trim()) {
    errors.push("brand.name must be a non-empty string");
  }
  if (brand.colors != null && !Array.isArray(brand.colors)) {
    errors.push("brand.colors must be an array");
  }
  if (brand.fonts != null && !Array.isArray(brand.fonts)) {
    errors.push("brand.fonts must be an array");
  }
  if (brand.forbidden != null && !Array.isArray(brand.forbidden)) {
    errors.push("brand.forbidden must be an array");
  }
  if (brand.safeArea != null) {
    const sa = brand.safeArea;
    if (typeof sa !== "object" || Array.isArray(sa)) {
      errors.push("brand.safeArea must be an object");
    } else if (
      typeof sa.top !== "number" ||
      typeof sa.right !== "number" ||
      typeof sa.bottom !== "number" ||
      typeof sa.left !== "number"
    ) {
      errors.push("brand.safeArea margins must be numbers");
    }
  }
  return { valid: errors.length === 0, errors };
}

const globalMemoryContextCache = new Map();

/** Clears all cached global memory prompt summaries. */
export function clearGlobalMemoryCache() {
  globalMemoryContextCache.clear();
}

/** Returns the number of cached context summaries. */
export function getGlobalMemoryCacheSize() {
  return globalMemoryContextCache.size;
}

/** Synchronously loads global brands from settings store. */
export function loadGlobalBrands() {
  return migrateGlobalBrands(getSetting(GLOBAL_BRANDS_STORAGE_KEY));
}

/** Persists global brands to settings store. */
export async function saveGlobalBrands(brands) {
  clearGlobalMemoryCache();
  await setSetting(GLOBAL_BRANDS_STORAGE_KEY, migrateGlobalBrands(brands));
}

/** Synchronously loads global user preferences from settings store. */
export function loadGlobalPreferences() {
  return migrateGlobalPreferences(getSetting(GLOBAL_PREFERENCES_STORAGE_KEY));
}

/** Persists global user preferences to settings store. */
export async function saveGlobalPreferences(preferences) {
  clearGlobalMemoryCache();
  await setSetting(GLOBAL_PREFERENCES_STORAGE_KEY, migrateGlobalPreferences(preferences));
}

/** Formats referenced brand and global preferences for system prompt injection. */
export function formatGlobalMemoryForPrompt({
  projectBrief,
  globalBrands = [],
  preferences = [],
  query = "",
  useCache = false,
} = {}) {
  const brandRef = projectBrief?.brandRefId || "";
  const prefTokens = preferences.map((p) => `${p.id}:${p.text}`).join("|");
  const cacheKey = `${brandRef}::${prefTokens}::${query}`;

  if (useCache && globalMemoryContextCache.has(cacheKey)) {
    return globalMemoryContextCache.get(cacheKey);
  }

  const parts = [];

  if (projectBrief?.brandRefId) {
    const effective = resolveEffectiveBrand(projectBrief, globalBrands);
    if (effective) {
      const brandLines = [`### Referenced Brand: ${effective.name}`];
      if (effective.hasOverrides) {
        brandLines.push("*(Note: Project Brief specifies custom overrides that take precedence over the referenced brand)*");
      }
      if (effective.colors && effective.colors.length > 0) {
        const colorList = effective.colors.map((c) => (c.role ? `${c.hex} (${c.role})` : c.hex)).join(", ");
        brandLines.push(`- Colors: ${colorList}`);
      }
      if (effective.fonts && effective.fonts.length > 0) {
        const fontList = effective.fonts.map((f) => (f.role ? `${f.family} (${f.role})` : f.family)).join(", ");
        brandLines.push(`- Fonts: ${fontList}`);
      }
      if (effective.forbidden && effective.forbidden.length > 0) {
        brandLines.push(`- Forbidden: ${effective.forbidden.join(", ")}`);
      }
      parts.push(brandLines.join("\n"));
    }
  }

  const selectedPrefs = selectGlobalPreferences(preferences, query, DEFAULT_PREFERENCES_LIMIT);
  if (selectedPrefs.length > 0) {
    const prefLines = ["### User Preferences (Active Across All Projects)"];
    for (const p of selectedPrefs) {
      const kindLabel = p.kind ? p.kind[0].toUpperCase() + p.kind.slice(1) : "Preference";
      prefLines.push(`- [${kindLabel}] ${p.text}`);
    }
    parts.push(prefLines.join("\n"));
  }

  const result = parts.length === 0 ? "" : `## Global Memory\n${parts.join("\n\n")}`;
  if (useCache) {
    globalMemoryContextCache.set(cacheKey, result);
  }
  return result;
}
