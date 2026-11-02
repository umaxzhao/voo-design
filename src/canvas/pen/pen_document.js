/**
 * Pen.app `.pen` documents: reading the file, validating its shape, and the
 * small amount of normalisation every later step relies on.
 *
 * A `.pen` file is plain JSON: `{ version, themes?, imports?, variables?, children }`
 * where every child is a scene node (`frame`, `group`, `rectangle`, `ellipse`,
 * `polygon`, `path`, `text`, `icon`, `ref`, …). The format is versioned per
 * minor (`2.6`, `2.13`, `2.20`) and only ever additive, so this reader accepts
 * any `2.x` document and refuses anything newer with an error the UI can show.
 *
 * Parsing never throws for a single malformed layer: it drops that layer and
 * records a warning, because a document with one bad node should still open.
 * A file that is not a Pen document at all — bad JSON, missing `children`,
 * a future version — does throw, so the caller can tell the user why instead
 * of opening an empty canvas.
 */

/** The only format generation this importer understands. */
export const PEN_SUPPORTED_MAJOR = 2;

/**
 * Node types the Pen schema defines (including the two legacy spellings the
 * bundled Pen 2.6/2.8 documents still contain). Anything else is reported as
 * unsupported instead of silently disappearing.
 */
export const PEN_NODE_TYPES = Object.freeze(
  new Set([
    "frame",
    "group",
    "rectangle",
    "ellipse",
    "polygon",
    "path",
    "text",
    "icon",
    "note",
    "prompt",
    "context",
    "browser",
    "script",
    "ref",
    // Legacy names still present in Pen's own bundled documents.
    "icon_font",
    "line",
  ]),
);

/** Types that exist in the format but have no honest editable VOO counterpart. */
export const PEN_UNSUPPORTED_TYPES = Object.freeze(
  new Set(["script", "browser", "prompt", "context"]),
);

/** A clear, user-presentable failure to read a `.pen` file. */
export class PenImportError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "PenImportError";
    this.code = code;
    this.details = details;
  }
}

function isPlainObject(value) {
  return (
    value !== null && typeof value === "object" && !Array.isArray(value)
  );
}

/** The `2.x` version string a document declares, or null when malformed. */
export function penVersionOf(document) {
  const version = document?.version;
  if (typeof version !== "string") return null;
  return /^\d+(?:\.\d+)+(?:[-+].*)?$/.test(version.trim())
    ? version.trim()
    : null;
}

/** Whether a value looks like a parsed `.pen` document. */
export function isPenDocument(value) {
  return isPlainObject(value) && Array.isArray(value.children);
}

/**
 * Decodes and validates `.pen` bytes (or an already-parsed object).
 *
 * Returns `{ document, version, warnings }` where warnings are
 * `{ message, count }` entries for structural problems that did not stop the
 * read. Throws a `PenImportError` when the value is not a usable Pen document.
 */
export function parsePenDocument(input) {
  let document = input;
  if (typeof input === "string" || input instanceof Uint8Array) {
    const text =
      typeof input === "string" ? input : new TextDecoder().decode(input);
    try {
      document = JSON.parse(text);
    } catch {
      throw new PenImportError(
        "pen-invalid-json",
        "This file is not a Pen document: its contents are not valid JSON.",
      );
    }
  }

  if (!isPlainObject(document)) {
    throw new PenImportError(
      "pen-invalid-document",
      "This file is not a Pen document: expected a JSON object.",
    );
  }

  const version = penVersionOf(document);
  const declaredVersion = document.version;
  if (typeof declaredVersion === "string" && version === null) {
    throw new PenImportError(
      "pen-invalid-version",
      `Invalid Pen document version: "${declaredVersion}".`,
    );
  }
  if (typeof declaredVersion !== "string") {
    // Pen has always written a version; a missing one is either a hand-written
    // fixture or a truncated file. Read it when the shape is right, and say so.
    if (!Array.isArray(document.children)) {
      throw new PenImportError(
        "pen-invalid-document",
        "This file is not a Pen document: it has no version and no layer list.",
      );
    }
  }

  if (!Array.isArray(document.children)) {
    throw new PenImportError(
      "pen-invalid-document",
      "Invalid Pen document: `children` must be an array of layers.",
    );
  }

  if (version) {
    const major = Number(version.split(".")[0]);
    if (major !== PEN_SUPPORTED_MAJOR) {
      throw new PenImportError(
        "pen-unsupported-version",
        `Unsupported Pen document version ${version}: this editor reads Pen 2.x files.`,
        { version },
      );
    }
  }

  const warnings = new Map();
  const note = (message) =>
    warnings.set(message, (warnings.get(message) ?? 0) + 1);

  if (!version) note("document-version-missing");

  const normalized = {
    ...document,
    children: normalizeChildren(document.children, note),
    themes: normalizeThemes(document.themes, note),
    variables: normalizeVariables(document.variables, note),
  };
  if (isPlainObject(document.imports)) {
    normalized.imports = document.imports;
  } else {
    delete normalized.imports;
  }

  return {
    document: normalized,
    version: version ?? `unknown (${PEN_SUPPORTED_MAJOR}.x expected)`,
    warnings: warningList(warnings),
  };
}

/** `{ axis: string[] }`; malformed axes are dropped rather than crashing. */
function normalizeThemes(value, note) {
  if (!isPlainObject(value)) {
    if (value != null) note("document-themes-invalid");
    return undefined;
  }
  const themes = {};
  for (const [axis, values] of Object.entries(value)) {
    if (Array.isArray(values) && values.every((item) => typeof item === "string")) {
      themes[axis] = [...values];
    } else {
      note("document-themes-invalid");
    }
  }
  return themes;
}

/** `{ name: { type, value } }`; entries without a type or value are dropped. */
function normalizeVariables(value, note) {
  if (!isPlainObject(value)) {
    if (value != null) note("document-variables-invalid");
    return {};
  }
  const variables = {};
  for (const [name, definition] of Object.entries(value)) {
    if (!isPlainObject(definition)) {
      note("document-variables-invalid");
      continue;
    }
    const typed = typeof definition.type === "string";
    const hasValue = Object.hasOwn(definition, "value");
    if (!typed || !hasValue) {
      note("document-variables-invalid");
      continue;
    }
    variables[name] = definition;
  }
  return variables;
}

/** Keeps the object layers and records how many junk entries were dropped. */
function normalizeChildren(children, note, depth = 0) {
  const kept = [];
  for (const child of children) {
    if (!isPlainObject(child)) {
      note("layer-not-an-object");
      continue;
    }
    if (typeof child.type !== "string") {
      note("layer-missing-type");
      continue;
    }
    kept.push(
      Array.isArray(child.children) && depth < 64
        ? { ...child, children: normalizeChildren(child.children, note, depth + 1) }
        : child,
    );
  }
  return kept;
}

/** Turns a warnings Map into the `{ message, count }` list the importers use. */
export function warningList(warnings) {
  if (!warnings) return [];
  if (Array.isArray(warnings)) return warnings;
  return [...warnings].map(([message, count]) => ({ message, count }));
}

/**
 * Walks every node in a parsed document, children before siblings, calling
 * `visit(node, parentNode)`. Returns nothing; a malformed child stops that
 * branch only.
 */
export function walkPenNodes(children, visit, parent = null, depth = 0) {
  if (!Array.isArray(children) || depth > 64) return;
  for (const child of children) {
    if (!isPlainObject(child) || typeof child.type !== "string") continue;
    visit(child, parent);
    if (Array.isArray(child.children)) {
      walkPenNodes(child.children, visit, child, depth + 1);
    }
  }
}
