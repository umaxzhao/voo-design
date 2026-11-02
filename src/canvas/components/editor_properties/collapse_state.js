/**
 * Collapse-state persistence for the property panel (ROADMAP 1.11).
 *
 * The panel is meant to fit the stage without scrolling, and folding groups
 * is how it does; remembering the user's folds per section keeps it that way
 * across sessions. Storage access is isolated here so the rules are
 * unit-testable with a fake store, and a blocked/absent storage partition
 * falls back to the default rather than failing to render.
 */

const PREFIX = "voo.props.";

function storageOf() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored open state for a section key, or `fallback` when unset. */
export function readCollapseState(key, fallback) {
  const storage = storageOf();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(`${PREFIX}${key}`);
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

/** Persists a section's open state. Best effort; never throws. */
export function writeCollapseState(key, open) {
  const storage = storageOf();
  if (!storage) return;
  try {
    storage.setItem(`${PREFIX}${key}`, open ? "1" : "0");
  } catch {
    // Quota or privacy mode: the fold simply is not remembered.
  }
}
