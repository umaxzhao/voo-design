/**
 * Project Memory — persistent decision, preference, and constraint memory.
 *
 * Provides a canonical data schema, schema migration, relevance selection,
 * prompt formatting, and memory state management for agent-assisted workflows.
 *
 * Pure runtime logic — zero React dependencies.
 *
 * @module agent-runtime/project-memory
 */

export const PROJECT_MEMORY_SCHEMA_VERSION = 1;

export const MEMORY_KINDS = Object.freeze(["decision", "preference", "constraint"]);

export const DEFAULT_MEMORY_LIMIT = 8;

/**
 * Creates an empty, schema-compliant Project Memory object.
 *
 * @returns {Object} Empty Project Memory
 */
export function createEmptyProjectMemory() {
  return {
    schemaVersion: PROJECT_MEMORY_SCHEMA_VERSION,
    items: [],
  };
}

/**
 * Generates a unique memory item ID.
 *
 * @returns {string} Unique memory ID
 */
function generateMemoryId() {
  return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalizes and validates a single memory item.
 *
 * @param {Object} raw - Raw item properties.
 * @returns {Object|null} Normalized memory item or null if invalid.
 */
export function createMemoryItem(raw = {}) {
  if (!raw || typeof raw !== "object") return null;

  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return null;

  const kind = MEMORY_KINDS.includes(raw.kind) ? raw.kind : "decision";

  const id = typeof raw.id === "string" && raw.id.trim()
    ? raw.id.trim()
    : generateMemoryId();

  const confidence =
    typeof raw.confidence === "number" && !isNaN(raw.confidence)
      ? Math.max(0, Math.min(1, raw.confidence))
      : 1.0;

  const createdAt =
    typeof raw.createdAt === "number" && !isNaN(raw.createdAt)
      ? raw.createdAt
      : Date.now();

  const lastUsedAt =
    typeof raw.lastUsedAt === "number" && !isNaN(raw.lastUsedAt)
      ? raw.lastUsedAt
      : null;

  const useCount =
    typeof raw.useCount === "number" && !isNaN(raw.useCount) && raw.useCount >= 0
      ? Math.floor(raw.useCount)
      : 0;

  const rawSource = raw.source && typeof raw.source === "object" ? raw.source : {};
  const source = {
    runId: typeof rawSource.runId === "string" ? rawSource.runId.trim() : null,
    stepId: typeof rawSource.stepId === "string" ? rawSource.stepId.trim() : null,
    messageExcerpt:
      typeof rawSource.messageExcerpt === "string"
        ? rawSource.messageExcerpt.trim()
        : null,
  };

  return {
    id,
    text,
    kind,
    source,
    confidence,
    createdAt,
    lastUsedAt,
    useCount,
  };
}

/**
 * Normalizes and migrates raw/legacy data to the current schema version.
 *
 * @param {any} raw - Unsanitized or legacy memory object.
 * @returns {Object} Schema v1 compliant memory object.
 */
export function migrateProjectMemory(raw) {
  if (!raw) return createEmptyProjectMemory();

  let rawItems = [];
  if (Array.isArray(raw)) {
    rawItems = raw;
  } else if (typeof raw === "object" && Array.isArray(raw.items)) {
    rawItems = raw.items;
  } else {
    return createEmptyProjectMemory();
  }

  const items = rawItems
    .map(createMemoryItem)
    .filter(Boolean);

  return {
    schemaVersion: PROJECT_MEMORY_SCHEMA_VERSION,
    items,
  };
}

/**
 * Validates a Project Memory object.
 *
 * @param {any} memory - Memory object to validate.
 * @returns {{ valid: boolean, errors: string[] }} Validation result.
 */
export function validateProjectMemory(memory) {
  const errors = [];

  if (!memory || typeof memory !== "object" || Array.isArray(memory)) {
    return { valid: false, errors: ["Memory must be a non-null object."] };
  }

  if (memory.schemaVersion !== PROJECT_MEMORY_SCHEMA_VERSION) {
    errors.push(
      `Unsupported schemaVersion: ${memory.schemaVersion} (expected ${PROJECT_MEMORY_SCHEMA_VERSION})`,
    );
  }

  if (!Array.isArray(memory.items)) {
    errors.push("Memory items must be an array.");
  } else {
    memory.items.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        errors.push(`Item at index ${index} must be an object.`);
        return;
      }
      if (!item.id || typeof item.id !== "string") {
        errors.push(`Item at index ${index} missing valid id.`);
      }
      if (!item.text || typeof item.text !== "string") {
        errors.push(`Item at index ${index} missing text.`);
      }
      if (!MEMORY_KINDS.includes(item.kind)) {
        errors.push(`Item at index ${index} has invalid kind: ${item.kind}.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Adds or updates a memory item in the project memory (pure function).
 *
 * @param {Object} memory - Current memory object.
 * @param {Object} itemData - Item properties to add.
 * @returns {Object} New memory object with the item added.
 */
export function addMemoryItem(memory, itemData) {
  const current = migrateProjectMemory(memory);
  const newItem = createMemoryItem(itemData);
  if (!newItem) return current;

  // Deduplicate if identical text and kind already exists
  const existingIdx = current.items.findIndex(
    (it) => it.text.toLowerCase() === newItem.text.toLowerCase() && it.kind === newItem.kind,
  );

  let updatedItems;
  if (existingIdx >= 0) {
    const existing = current.items[existingIdx];
    const merged = {
      ...existing,
      ...newItem,
      id: existing.id,
      createdAt: existing.createdAt,
      useCount: existing.useCount,
      lastUsedAt: existing.lastUsedAt,
      confidence: Math.max(existing.confidence, newItem.confidence),
    };
    updatedItems = [...current.items];
    updatedItems[existingIdx] = merged;
  } else {
    updatedItems = [...current.items, newItem];
  }

  return {
    ...current,
    items: updatedItems,
  };
}

/**
 * Removes a memory item by ID (pure function).
 *
 * @param {Object} memory - Current memory object.
 * @param {string} id - ID of item to remove.
 * @returns {Object} New memory object without the item.
 */
export function removeMemoryItem(memory, id) {
  const current = migrateProjectMemory(memory);
  if (!id) return current;
  return {
    ...current,
    items: current.items.filter((item) => item.id !== id),
  };
}

/**
 * Clears all memory items (pure function).
 *
 * @param {Object} memory - Current memory object.
 * @returns {Object} Empty memory object.
 */
export function clearProjectMemory(memory) {
  const current = migrateProjectMemory(memory);
  return {
    ...current,
    items: [],
  };
}

/**
 * Extracts normalized search tokens from text.
 *
 * @param {string} text - Query or text content.
 * @returns {string[]} Array of lowercase keywords.
 */
function extractKeywords(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Selects the top N most relevant memory items for a query.
 *
 * Ranking criteria:
 * 1. Keyword overlap with query
 * 2. Confidence score (0–1)
 * 3. Recency (lastUsedAt || createdAt)
 * 4. Frequency (useCount)
 *
 * @param {Object} memory - Current memory object.
 * @param {string} [query=""] - User prompt or current context.
 * @param {number} [limit=DEFAULT_MEMORY_LIMIT] - Maximum items to return.
 * @returns {Object[]} Top relevant memory items.
 */
export function selectRelevantMemories(
  memory,
  query = "",
  limit = DEFAULT_MEMORY_LIMIT,
) {
  const current = migrateProjectMemory(memory);
  if (!current.items || current.items.length === 0) return [];

  const maxItems = typeof limit === "number" && limit > 0 ? limit : DEFAULT_MEMORY_LIMIT;
  const queryKeywords = extractKeywords(query);

  const scored = current.items.map((item) => {
    let keywordMatches = 0;
    if (queryKeywords.length > 0) {
      const itemKeywords = new Set(extractKeywords(item.text));
      for (const qk of queryKeywords) {
        if (itemKeywords.has(qk) || item.text.toLowerCase().includes(qk)) {
          keywordMatches += 1;
        }
      }
    }

    const recencyTime = item.lastUsedAt || item.createdAt || 0;
    const confidence = item.confidence ?? 1.0;
    const useCount = item.useCount ?? 0;

    // Total score calculation:
    // Keyword matches dominate (100 pts per match)
    // Confidence contributes up to 20 pts
    // Frequency contributes up to 5 pts
    // Recency tie-breaker
    const totalScore =
      keywordMatches * 100 +
      confidence * 20 +
      Math.min(useCount, 10) * 0.5;

    return {
      item,
      totalScore,
      keywordMatches,
      recencyTime,
      confidence,
    };
  });

  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return b.recencyTime - a.recencyTime;
  });

  return scored.slice(0, maxItems).map((s) => s.item);
}

/**
 * Updates `lastUsedAt` and increments `useCount` for the specified memory IDs.
 *
 * @param {Object} memory - Current memory object.
 * @param {string[]} usedIds - IDs of items used in the current round.
 * @param {number} [timestamp=Date.now()] - Timestamp of usage.
 * @returns {Object} New memory object with updated usage stats.
 */
export function touchMemories(memory, usedIds, timestamp = Date.now()) {
  const current = migrateProjectMemory(memory);
  if (!Array.isArray(usedIds) || usedIds.length === 0) return current;

  const idSet = new Set(usedIds);
  let changed = false;

  const items = current.items.map((item) => {
    if (!idSet.has(item.id)) return item;
    changed = true;
    return {
      ...item,
      lastUsedAt: timestamp,
      useCount: (item.useCount || 0) + 1,
    };
  });

  if (!changed) return current;

  return {
    ...current,
    items,
  };
}

/**
 * Formats an array of memory items into a markdown prompt block.
 *
 * @param {Object[]|Object} memories - Array of memory items or memory object.
 * @returns {string} Formatted markdown block or empty string.
 */
export function formatMemoriesForPrompt(memories) {
  let items = [];
  if (Array.isArray(memories)) {
    items = memories;
  } else if (memories && Array.isArray(memories.items)) {
    items = memories.items;
  }

  if (items.length === 0) return "";

  const kindLabels = {
    decision: "Decision",
    preference: "Preference",
    constraint: "Constraint",
  };

  const lines = items.map((item) => {
    const label = kindLabels[item.kind] || "Decision";
    return `- [${label}] ${item.text}`;
  });

  return `## Project Memory
The following confirmed decisions, preferences, and constraints from earlier in this project must be strictly respected:
${lines.join("\n")}`;
}
