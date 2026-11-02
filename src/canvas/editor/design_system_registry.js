import { getSetting, setSetting } from "../../shared/settings.js";
import { validateDesignTokens } from "./design_tokens.js";
import { BUILT_IN_DESIGN_SYSTEMS } from "./design_system_presets.js";

/** Persisted list of user-created systems: [{ id, name, designTokens, designMd }]. */
export const CUSTOM_DESIGN_SYSTEMS_SETTING = "voo.designSystems.custom";
export const MAX_DESIGN_SYSTEM_NAME_LENGTH = 60;

/** Errors carry a stable `code` so the UI can translate them. */
function registryError(code) {
  return Object.assign(new Error(code), { code });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || trimmed.length > MAX_DESIGN_SYSTEM_NAME_LENGTH) {
    throw registryError("invalid-name");
  }
  return trimmed;
}

function newCustomId() {
  return `custom-${globalThis.crypto.randomUUID()}`;
}

/** Drop persisted entries that no longer satisfy the document token contract. */
export function normalizeCustomDesignSystems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const entry of value) {
    if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) continue;
    if (typeof entry.name !== "string" || !entry.name.trim()) continue;
    try {
      validateDesignTokens(entry.designTokens);
    } catch {
      // A corrupted entry must not take the whole registry down.
      continue;
    }
    seen.add(entry.id);
    result.push({
      id: entry.id,
      name: entry.name.trim().slice(0, MAX_DESIGN_SYSTEM_NAME_LENGTH),
      builtIn: false,
      designTokens: clone(entry.designTokens),
      designMd: typeof entry.designMd === "string" ? entry.designMd : "",
    });
  }
  return result;
}

export function loadCustomDesignSystems() {
  return normalizeCustomDesignSystems(getSetting(CUSTOM_DESIGN_SYSTEMS_SETTING));
}

/** Persists through the shared settings stores; resolves once storage accepted it. */
export function saveCustomDesignSystems(list) {
  const stored = list.map(({ id, name, designTokens, designMd }) => ({
    id,
    name,
    designTokens,
    designMd,
  }));
  return setSetting(CUSTOM_DESIGN_SYSTEMS_SETTING, stored);
}

/** Built-in presets first, then the user's systems. */
export function listDesignSystems(custom = loadCustomDesignSystems()) {
  return [...BUILT_IN_DESIGN_SYSTEMS, ...custom];
}

export function findDesignSystem(id, custom = loadCustomDesignSystems()) {
  return listDesignSystems(custom).find((system) => system.id === id) ?? null;
}

/** New custom system seeded from any system; never mutates the source. */
export function duplicateDesignSystem(custom, source, name) {
  const copy = {
    id: newCustomId(),
    name: cleanName(name),
    builtIn: false,
    designTokens: clone(source.designTokens),
    designMd: source.designMd ?? "",
  };
  return { list: [...custom, copy], system: copy };
}

function assertCustom(custom, id) {
  const index = custom.findIndex((system) => system.id === id);
  if (index === -1) {
    // Presets are never in the persisted list.
    throw registryError(
      BUILT_IN_DESIGN_SYSTEMS.some((preset) => preset.id === id)
        ? "read-only"
        : "not-found",
    );
  }
  return index;
}

export function renameDesignSystem(custom, id, name) {
  const index = assertCustom(custom, id);
  const next = [...custom];
  next[index] = { ...custom[index], name: cleanName(name) };
  return { list: next, system: next[index] };
}

export function deleteDesignSystem(custom, id) {
  assertCustom(custom, id);
  return custom.filter((system) => system.id !== id);
}

/**
 * Save edited tokens/markdown. A custom system is updated in place; a
 * built-in preset is never touched, the edits go into a new named copy.
 */
export function saveDesignSystemEdits(custom, source, edits, copyName) {
  const designTokens = clone(validateDesignTokens(edits.designTokens));
  const designMd = String(edits.designMd ?? "");
  if (source.builtIn) {
    return duplicateDesignSystem(
      custom,
      { designTokens, designMd },
      copyName,
    );
  }
  const index = assertCustom(custom, source.id);
  const next = [...custom];
  next[index] = { ...custom[index], designTokens, designMd };
  return { list: next, system: next[index] };
}

/** One undoable document edit: copies tokens, markdown and the selected id. */
export function applyDesignSystemToDocument(editor, system) {
  if (!editor?.getDocument?.() || !editor.setDesignSystem) {
    throw registryError("no-document");
  }
  editor.setDesignSystem({
    designTokens: system.designTokens,
    designMd: system.designMd,
    designSystemId: system.id,
  });
}

/** Display name: presets are translated, custom systems carry the user's text. */
export function designSystemName(system, t) {
  return system.builtIn ? t(system.nameKey) : system.name;
}
