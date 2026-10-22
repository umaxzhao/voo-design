/**
 * Command palette registry.
 *
 * Pure module: no React, no DOM, no engine. It turns three existing sources
 * into one searchable index:
 *
 *   1. `COMMAND_DEFINITIONS` — the editor's agent-facing command table. Only
 *      parameter-free actions are listed: a palette row has no arguments UI,
 *      so a command that requires `args` cannot be run from it.
 *   2. `DESIGN_SHORTCUT_GROUPS` — the shortcut reference catalog. It supplies
 *      the shortcut chips and confirms which catalog rows are real editor
 *      actions; rows without a runnable target stay in the cheat-sheet only.
 *   3. An explicit `actions` list supplied by the host (undo/redo, zoom, view
 *      toggles, panel openers). The host owns their handlers, so this module
 *      stays free of engine imports.
 *
 * The palette component owns presentation, focus and localStorage persistence;
 * everything here is deterministic and side-effect free so it can be tested in
 * the node environment.
 */

import { COMMAND_DEFINITIONS } from "../editor/command_table/definitions.js";
import { DESIGN_SHORTCUT_GROUPS } from "../../shared/editor-shortcut-catalog.js";

export const MAX_RECENT_COMMANDS = 8;

/**
 * i18n label keys for command-table ids that have a user-facing dictionary
 * entry. Commands without a key fall back to the definition's English summary.
 */
export const COMMAND_LABEL_KEYS = Object.freeze({
  duplicate_selected: "editor.menu.duplicate",
  delete_selected: "editor.menu.delete",
  group_selection: "editor.menu.group",
  ungroup_selection: "editor.menu.ungroup",
  create_clipping_mask: "editor.menu.createClipMask",
  release_clipping_mask: "editor.menu.releaseClipMask",
  bring_to_front: "editor.shortcut.toFront",
  send_to_back: "editor.shortcut.toBack",
  select_all: "editor.menu.selectAll",
  layer_via_copy: "editor.menu.layerFromSelection",
  stroke_selection: "editor.menu.strokeSelection",
});

/** Shortcut-catalog rows that execute a command-table command. */
export const COMMAND_CATALOG_IDS = Object.freeze({
  "editor.menu.duplicate": "duplicate_selected",
  "editor.menu.delete": "delete_selected",
  "editor.menu.group": "group_selection",
  "editor.menu.ungroup": "ungroup_selection",
  "editor.menu.createClipMask": "create_clipping_mask",
  "editor.menu.releaseClipMask": "release_clipping_mask",
  "editor.menu.selectAll": "select_all",
  "editor.menu.layerFromSelection": "layer_via_copy",
  "editor.shortcut.toFront": "bring_to_front",
  "editor.shortcut.toBack": "send_to_back",
});

/** Resolves a translated label, falling back while the dictionary is unwired. */
export function resolveLabel(t, labelKey, fallback) {
  if (!labelKey) return fallback;
  const value = typeof t === "function" ? t(labelKey) : labelKey;
  return typeof value === "string" && value && value !== labelKey
    ? value
    : fallback;
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/** Builds `labelKey → shortcut chip` from the shortcut catalog (first row wins). */
function shortcutMap(shortcutGroups) {
  const map = new Map();
  for (const group of shortcutGroups ?? []) {
    for (const row of group?.shortcuts ?? []) {
      if (!row?.labelKey || !row?.key || map.has(row.labelKey)) continue;
      map.set(row.labelKey, row.key);
    }
  }
  return map;
}

/** `commandId → labelKey` from the catalog mapping (first mapping wins). */
function commandCatalogKeys() {
  const map = new Map();
  for (const [labelKey, commandId] of Object.entries(COMMAND_CATALOG_IDS)) {
    if (!map.has(commandId)) map.set(commandId, labelKey);
  }
  return map;
}

function commandEntries({ t, definitions, shortcuts }) {
  const catalogKeys = commandCatalogKeys();
  const entries = [];
  for (const definition of Object.values(definitions ?? {})) {
    if (!definition || definition.kind !== "action") continue;
    if ((definition.requires?.args ?? []).length > 0) continue;
    const labelKey = COMMAND_LABEL_KEYS[definition.id] ?? null;
    const fallback = definition.summary || definition.id;
    const label = resolveLabel(t, labelKey, fallback);
    const catalogKey = catalogKeys.get(definition.id) ?? null;
    entries.push({
      id: `command:${definition.id}`,
      kind: "command",
      group: "commands",
      sourceId: definition.id,
      label,
      description: definition.description ?? "",
      shortcut: catalogKey ? shortcuts.get(catalogKey) ?? null : null,
      keywords: [
        String(definition.id ?? "").replace(/_/g, " "),
        definition.summary ?? "",
      ],
      run: null,
    });
  }
  return entries.sort(
    (left, right) =>
      left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );
}

function actionEntries({ t, actions, shortcuts }) {
  const entries = [];
  const seen = new Set();
  for (const action of Array.isArray(actions) ? actions : []) {
    if (!action?.id || typeof action.run !== "function") continue;
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    const label = resolveLabel(
      t,
      action.labelKey,
      action.label ?? action.id,
    );
    const shortcut =
      action.shortcut ??
      (action.catalogKey ? shortcuts.get(action.catalogKey) ?? null : null);
    entries.push({
      id: `action:${action.id}`,
      kind: "action",
      group: "actions",
      sourceId: action.id,
      label,
      description: action.description ?? "",
      shortcut,
      keywords: [
        String(action.id ?? "").replace(/-/g, " "),
        ...(Array.isArray(action.keywords) ? action.keywords : []),
        action.label ?? "",
      ],
      run: action.run,
    });
  }
  return entries.sort(
    (left, right) =>
      left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );
}

/**
 * Builds the palette index.
 *
 * @param {object} [options]
 * @param {(key:string, params?:object) => string} [options.t] translate function
 * @param {Array<{id:string,label?:string,labelKey?:string,description?:string,
 *   shortcut?:string,catalogKey?:string,keywords?:string[],run:Function}>} [options.actions]
 *   host actions with handlers
 * @param {object} [options.definitions] command table override (tests)
 * @param {Array} [options.shortcutGroups] shortcut catalog override (tests)
 * @returns {Array<object>} deterministic command entries
 */
export function buildCommandIndex({
  t = (key) => key,
  actions = [],
  definitions = COMMAND_DEFINITIONS,
  shortcutGroups = DESIGN_SHORTCUT_GROUPS,
} = {}) {
  const shortcuts = shortcutMap(shortcutGroups);
  return [
    ...commandEntries({ t, definitions, shortcuts }),
    ...actionEntries({ t, actions, shortcuts }),
  ];
}

/**
 * Fuzzy subsequence score for one candidate string. Returns 0 when the query
 * characters do not appear in order.
 */
export function subsequenceScore(query, text) {
  if (!query || !text) return 0;
  let cursor = 0;
  let previous = -2;
  let first = -1;
  let run = 0;
  let score = 0;
  for (const character of query) {
    const found = text.indexOf(character, cursor);
    if (found === -1) return 0;
    if (first === -1) first = found;
    if (found === previous + 1) {
      run += 1;
      score += 4 + run;
    } else {
      run = 0;
      score += 1;
    }
    const before = found === 0 ? "" : text.charAt(found - 1);
    if (found === 0 || /[\s\-_./]/.test(before)) score += 6;
    previous = found;
    cursor = found + 1;
  }
  // Prefer matches that start early in a short candidate.
  score -= first * 0.5;
  score -= Math.max(0, text.length - query.length) * 0.05;
  return Math.max(1, score);
}

function weightedScore(query, text, weight) {
  const candidate = normalizeText(text);
  if (!candidate) return 0;
  if (candidate === query) return 100 * weight;
  if (candidate.startsWith(query)) {
    return 80 * weight - Math.min(20, candidate.length - query.length);
  }
  const substringAt = candidate.indexOf(query);
  if (substringAt >= 0) {
    return (
      60 * weight -
      Math.min(20, substringAt) -
      Math.min(10, candidate.length - query.length) * 0.2
    );
  }
  return subsequenceScore(query, candidate) * weight;
}

/**
 * Scores one entry against a query. Bigger is better; 0 means "no match".
 *
 * Weights: label 3, keywords 2.5, id 2, description 1 — a label match always
 * beats a keyword match, which beats a description-only match.
 */
export function scoreCommand(query, command) {
  const normalized = normalizeText(query);
  if (!normalized) return 0;
  if (!command) return 0;
  const scores = [
    weightedScore(normalized, command.label, 3),
    weightedScore(normalized, command.id, 2),
    weightedScore(normalized, command.description, 1),
  ];
  for (const keyword of command.keywords ?? []) {
    scores.push(weightedScore(normalized, keyword, 2.5));
  }
  return Math.max(0, ...scores);
}

/**
 * Filters and ranks the index.
 *
 * An empty query returns the index in its deterministic build order (used for
 * the "recent + all commands" view); a non-empty query keeps positive scores
 * only and breaks ties by shorter label, then label, then id.
 */
export function filterCommands(index, query, { limit = Infinity } = {}) {
  const list = Array.isArray(index) ? index : [];
  const normalized = normalizeText(query);
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Infinity;
  if (!normalized) {
    return max === Infinity ? [...list] : list.slice(0, max);
  }
  const ranked = [];
  for (const command of list) {
    const score = scoreCommand(normalized, command);
    if (score <= 0) continue;
    ranked.push({ command, score });
  }
  ranked.sort(
    (left, right) =>
      right.score - left.score ||
      left.command.label.length - right.command.label.length ||
      left.command.label.localeCompare(right.command.label) ||
      left.command.id.localeCompare(right.command.id),
  );
  const commands = ranked.map((entry) => entry.command);
  return max === Infinity ? commands : commands.slice(0, max);
}

/**
 * Wraps the active index by `delta` over `count` entries (arrow-key wrap).
 *
 * Accepts either a bare index or a state object carrying `{index}`; an object
 * comes back as a shallow copy with the wrapped index, so callers can keep
 * their own cursor state without unpacking it.
 */
export function moveSelection(state, delta, count) {
  const size = Number.isFinite(count) ? Math.floor(count) : 0;
  const isState = Boolean(state) && typeof state === "object";
  const current = isState ? state.index : state;
  if (size <= 0) {
    return isState ? { ...state, index: 0 } : 0;
  }
  const start = Number.isInteger(current) ? current : 0;
  const step = Number.isInteger(delta) ? delta : 0;
  const raw = (start + step) % size;
  const next = raw < 0 ? raw + size : raw;
  return isState ? { ...state, index: next } : next;
}

/** Valid, unique, non-empty ids in their original order. */
export function normalizeRecent(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Moves `id` to the front of the recent list, de-duplicated and capped. */
export function pushRecent(id, list, max = MAX_RECENT_COMMANDS) {
  if (typeof id !== "string" || !id.trim()) return normalizeRecent(list);
  const trimmed = id.trim();
  const next = [trimmed, ...normalizeRecent(list).filter((each) => each !== trimmed)];
  const cap = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
  return cap > 0 ? next.slice(0, cap) : normalizeRecent(list);
}

/** Resolves recent ids to index entries, preserving the recent ordering. */
export function resolveRecent(index, recentIds) {
  const byId = new Map(
    (Array.isArray(index) ? index : []).map((command) => [command.id, command]),
  );
  const out = [];
  for (const id of normalizeRecent(recentIds)) {
    const command = byId.get(id);
    if (command) out.push(command);
  }
  return out;
}
