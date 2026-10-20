/**
 * Heuristic extraction and normalization of visual style anchors.
 *
 * Extracts palette (hex + keywords), style descriptions, composition cues,
 * and character/subject notes from prompts and project briefs.
 *
 * Pure logic — zero React dependencies.
 *
 * @module agent-panel/style-seed-extract
 */

import { migrateProjectBrief } from "../../agent-runtime/project-brief.js";

/**
 * Extracts a deduplicated palette of hex colors and color keywords from the prompt and brief.
 *
 * @param {Object} [options]
 * @param {string} [options.prompt]
 * @param {Object} [options.brief]
 * @returns {string[]}
 */
export function extractPalette({ prompt = "", brief = null } = {}) {
  const palette = [];
  const seen = new Set();

  const addColor = (c) => {
    if (!c || typeof c !== "string") return;
    const clean = c.trim();
    if (!clean) return;
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      palette.push(clean);
    }
  };

  // 1. Colors from project brief (brand colors & palette)
  if (brief) {
    const migrated = migrateProjectBrief(brief);
    if (Array.isArray(migrated.brand?.colors)) {
      for (const colorItem of migrated.brand.colors) {
        const hex = typeof colorItem === "string" ? colorItem : colorItem?.hex;
        addColor(hex);
      }
    }
    if (Array.isArray(brief.brandColors)) {
      for (const colorItem of brief.brandColors) {
        const hex = typeof colorItem === "string" ? colorItem : colorItem?.hex;
        addColor(hex);
      }
    }
    if (Array.isArray(brief.palette)) {
      for (const colorItem of brief.palette) {
        const hex = typeof colorItem === "string" ? colorItem : colorItem?.hex;
        addColor(hex);
      }
    }
  }

  // 2. Hex colors from prompt
  const hexMatches = String(prompt).match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hexMatches) {
    for (const hex of hexMatches) {
      addColor(hex);
    }
  }

  // 3. Named color descriptors in prompt
  const colorKeywords = [
    "neon blue", "neon green", "neon pink", "neon purple", "neon cyan", "neon yellow",
    "pastel pink", "pastel blue", "pastel green", "pastel purple", "pastel yellow",
    "warm amber", "warm gold", "cool blue", "cool gray", "deep navy", "emerald green",
    "crimson red", "rose gold", "midnight blue", "sunset orange", "mint green",
    "monochrome", "grayscale", "black and white",
    "gold", "silver", "amber", "cyan", "magenta", "crimson", "emerald", "navy",
    "bronze", "copper", "violet", "indigo", "teal", "turquoise", "charcoal",
    "coral", "lavender", "peach", "ruby", "sapphire",
  ];

  const lowerPrompt = String(prompt).toLowerCase();
  for (const kw of colorKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(lowerPrompt)) {
      addColor(kw);
    }
  }

  return palette;
}

/**
 * Extracts a style description from the prompt, brief, and explicit style option.
 *
 * @param {Object} [options]
 * @param {string} [options.prompt]
 * @param {Object} [options.brief]
 * @param {string} [options.style]
 * @returns {string}
 */
export function extractStyleDescription({ prompt = "", brief = null, style = "" } = {}) {
  const styles = [];

  // 1. Explicit style parameter
  if (style && typeof style === "string" && style.trim()) {
    styles.push(style.trim());
  }

  // 2. Brief style
  if (brief) {
    const migrated = migrateProjectBrief(brief);
    if (migrated.style && typeof migrated.style === "string" && migrated.style.trim()) {
      styles.push(migrated.style.trim());
    }
  }

  // 3. Style extracted from prompt
  const lowerPrompt = String(prompt).toLowerCase();

  const stylePhraseMatch = String(prompt).match(
    /(?:in the style of|style of|art style:?|aesthetic:?|rendered in)\s*([^,.;\n]+)/i,
  );
  if (stylePhraseMatch && stylePhraseMatch[1]) {
    styles.push(stylePhraseMatch[1].trim());
  }

  const styleKeywords = [
    "cyberpunk", "steampunk", "synthwave", "vaporwave", "minimalist", "minimalism",
    "editorial", "watercolor", "oil painting", "acrylic painting", "gouache",
    "sketch", "line art", "pencil drawing", "flat illustration", "vector art",
    "3d render", "isometric 3d", "claymation", "pixel art", "photorealistic",
    "cinematic", "anime", "manga", "comic book", "pop art", "bauhaus", "art deco",
    "art nouveau", "vintage", "retro", "surrealism", "impressionism", "dark fantasy",
    "sci-fi", "film noir", "modernist", "corporate clean",
  ];

  for (const sk of styleKeywords) {
    const regex = new RegExp(`\\b${sk}\\b`, "i");
    if (regex.test(lowerPrompt)) {
      styles.push(sk);
    }
  }

  // Deduplicate
  const seen = new Set();
  const deduped = [];
  for (const s of styles) {
    const lower = s.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      deduped.push(s);
    }
  }

  if (deduped.length > 0) {
    return deduped.join(", ");
  }

  const trimmed = String(prompt).trim();
  if (trimmed) {
    const firstClause = trimmed.split(/[,.;\n]/)[0].trim();
    return `Style derived from "${firstClause.slice(0, 40)}"`;
  }

  return "Consistent series style";
}

/**
 * Extracts composition cues from the prompt.
 *
 * @param {Object} [options]
 * @param {string} [options.prompt]
 * @returns {string}
 */
export function extractComposition({ prompt = "" } = {}) {
  const compCues = [];
  const lowerPrompt = String(prompt).toLowerCase();

  const compositionKeywords = [
    "extreme wide shot", "wide shot", "ultra-wide shot", "panoramic", "landscape orientation",
    "close-up", "extreme close-up", "macro shot", "portrait orientation",
    "medium shot", "full body shot", "cowboy shot",
    "aerial view", "bird's-eye view", "drone shot", "top-down", "overhead view",
    "low angle", "high angle", "dutch angle", "eye level",
    "isometric view", "isometric 3d", "isometric",
    "rule of thirds", "centered composition", "centered", "symmetrical", "symmetry",
    "split screen", "multi-panel", "diptych", "triptych",
    "grid layout", "editorial layout", "presentation slide layout", "hero layout",
    "golden ratio",
    "cinematic lighting", "volumetric lighting", "rim lighting", "soft diffused light",
    "dramatic shadows", "studio lighting", "golden hour", "dramatic lighting",
  ];

  for (const ck of compositionKeywords) {
    const regex = new RegExp(`\\b${ck}\\b`, "i");
    if (regex.test(lowerPrompt)) {
      compCues.push(ck);
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const c of compCues) {
    const lower = c.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      deduped.push(c);
    }
  }

  if (deduped.length > 0) {
    return deduped.join(", ");
  }

  return "balanced layout, centered composition";
}

/**
 * Extracts character and subject cues from the prompt.
 *
 * @param {Object} [options]
 * @param {string} [options.prompt]
 * @returns {string}
 */
export function extractCharacterNotes({ prompt = "" } = {}) {
  const notes = [];
  const text = String(prompt).trim();

  // 1. Explicit character notes label: "character: ...", "character notes: ..."
  const labelMatch = text.match(
    /(?:character|character notes|subject|protagonist|mascot):\s*([^,.;\n]+)/i,
  );
  if (labelMatch && labelMatch[1]) {
    notes.push(labelMatch[1].trim());
  }

  // 2. Character / entity with descriptive clause
  const entityMatch = text.match(
    /\b(?:a|an|the)?\s*([a-zA-Z0-9\s-]{2,30}?(?:character|protagonist|mascot|woman|man|girl|boy|person|robot|cyborg|creature|avatar|figure|detective|hacker|warrior|astronaut|model|hero)\s+(?:with|in|wearing|holding|dressed in)\s+[^,.;\n]+)/i,
  );
  if (entityMatch && entityMatch[1]) {
    notes.push(entityMatch[1].trim());
  } else {
    // 3. Simpler character noun phrase
    const simpleEntityMatch = text.match(
      /\b([a-zA-Z0-9\s-]{2,20}?(?:character|protagonist|mascot|woman|man|girl|boy|person|robot|cyborg|creature|avatar|detective|hacker|warrior|astronaut|model|hero))\b/i,
    );
    if (simpleEntityMatch && simpleEntityMatch[1]) {
      notes.push(simpleEntityMatch[1].trim());
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const n of notes) {
    const lower = n.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      deduped.push(n);
    }
  }

  if (deduped.length > 0) {
    return deduped.join(", ");
  }

  return "";
}

/**
 * Synchronous prompt-derived style anchor builder.
 *
 * @param {Object} [options]
 * @param {string} [options.prompt]
 * @param {Object} [options.brief]
 * @param {string} [options.style]
 * @returns {{ styleDescription: string, palette: string[], composition: string, characterNotes: string }}
 */
export function extractPromptStyleAnchor({ prompt = "", brief = null, style = "" } = {}) {
  return {
    styleDescription: extractStyleDescription({ prompt, brief, style }),
    palette: extractPalette({ prompt, brief }),
    composition: extractComposition({ prompt }),
    characterNotes: extractCharacterNotes({ prompt }),
  };
}

/**
 * Normalizes an external or partial style anchor object against the schema.
 *
 * @param {Object} [rawAnchor]
 * @param {Object} [fallbackInput]
 * @returns {{ styleDescription: string, palette: string[], composition: string, characterNotes: string }}
 */
export function normalizeStyleAnchor(rawAnchor = {}, fallbackInput = {}) {
  const fallback = extractPromptStyleAnchor(fallbackInput);
  const palette = Array.isArray(rawAnchor?.palette)
    ? rawAnchor.palette
    : fallback.palette;

  return {
    styleDescription:
      typeof rawAnchor?.styleDescription === "string" && rawAnchor.styleDescription.trim()
        ? rawAnchor.styleDescription.trim()
        : fallback.styleDescription,
    palette: Array.from(
      new Set(
        palette
          .map((c) => (typeof c === "string" ? c.trim() : String(c?.hex || "").trim()))
          .filter(Boolean),
      ),
    ),
    composition:
      typeof rawAnchor?.composition === "string" && rawAnchor.composition.trim()
        ? rawAnchor.composition.trim()
        : fallback.composition,
    characterNotes:
      typeof rawAnchor?.characterNotes === "string"
        ? rawAnchor.characterNotes.trim()
        : fallback.characterNotes,
  };
}
