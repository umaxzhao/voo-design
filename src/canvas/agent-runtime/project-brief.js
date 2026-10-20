/**
 * Project Brief — structured project specification for agent-assisted workflows.
 *
 * Provides a canonical data schema, schema migration, validation, sanitization,
 * merging, and prompt formatting for the project brief.
 *
 * Pure runtime logic — zero React dependencies.
 *
 * @module agent-runtime/project-brief
 */

export const PROJECT_BRIEF_SCHEMA_VERSION = 1;

/**
 * Creates an empty, schema-compliant Project Brief object.
 *
 * @returns {Object} Empty Project Brief
 */
export function createEmptyProjectBrief() {
  return {
    schemaVersion: PROJECT_BRIEF_SCHEMA_VERSION,
    goal: "",
    audience: "",
    brand: {
      colors: [],
      fonts: [],
      logoAssetId: null,
      safeArea: null,
      forbidden: [],
    },
    brandRefId: null,
    style: "",
    specs: [],
    references: [],
    confirmedDecisions: [],
  };
}

/**
 * Normalizes and migrates raw/legacy data to the current schema version.
 *
 * @param {any} raw - Unsanitized or legacy brief object.
 * @returns {Object} Schema v1 compliant brief.
 */
export function migrateProjectBrief(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyProjectBrief();
  }

  // Schema version ladder: currently version 1.
  const goal = typeof raw.goal === "string" ? raw.goal.trim() : "";
  const audience = typeof raw.audience === "string" ? raw.audience.trim() : "";
  const style = typeof raw.style === "string" ? raw.style.trim() : "";

  // Brand normalization
  const rawBrand = raw.brand && typeof raw.brand === "object" ? raw.brand : {};

  // Colors: [{ hex, role }]
  const rawColors = Array.isArray(rawBrand.colors)
    ? rawBrand.colors
    : Array.isArray(raw.brandColors)
    ? raw.brandColors
    : [];
  const colors = rawColors
    .filter((c) => c && (typeof c === "string" || typeof c.hex === "string"))
    .map((c) => {
      if (typeof c === "string") {
        return { hex: c.trim(), role: "" };
      }
      return {
        hex: String(c.hex || "").trim(),
        role: String(c.role || "").trim(),
      };
    })
    .filter((c) => Boolean(c.hex));

  // Fonts: [{ family, role }]
  const rawFonts = Array.isArray(rawBrand.fonts)
    ? rawBrand.fonts
    : Array.isArray(raw.brandFonts)
    ? raw.brandFonts
    : [];
  const fonts = rawFonts
    .filter((f) => f && (typeof f === "string" || typeof f.family === "string"))
    .map((f) => {
      if (typeof f === "string") {
        return { family: f.trim(), role: "" };
      }
      return {
        family: String(f.family || "").trim(),
        role: String(f.role || "").trim(),
      };
    })
    .filter((f) => Boolean(f.family));

  // Logo asset ID
  const logoAssetId =
    typeof rawBrand.logoAssetId === "string" && rawBrand.logoAssetId.trim()
      ? rawBrand.logoAssetId.trim()
      : typeof raw.logoAssetId === "string" && raw.logoAssetId.trim()
      ? raw.logoAssetId.trim()
      : null;

  // Safe area: { top, right, bottom, left } or null
  let safeArea = null;
  const rawSafeArea = rawBrand.safeArea ?? raw.safeArea ?? raw.safeMargin;
  if (typeof rawSafeArea === "number") {
    safeArea = {
      top: rawSafeArea,
      right: rawSafeArea,
      bottom: rawSafeArea,
      left: rawSafeArea,
    };
  } else if (rawSafeArea && typeof rawSafeArea === "object") {
    safeArea = {
      top: Number(rawSafeArea.top ?? 0),
      right: Number(rawSafeArea.right ?? 0),
      bottom: Number(rawSafeArea.bottom ?? 0),
      left: Number(rawSafeArea.left ?? 0),
    };
  }

  // Forbidden: array of strings (colors, fonts, keywords)
  const rawForbidden = Array.isArray(rawBrand.forbidden)
    ? rawBrand.forbidden
    : Array.isArray(raw.forbidden)
    ? raw.forbidden
    : [];
  const forbidden = rawForbidden
    .map((item) => (item != null ? String(item).trim() : ""))
    .filter(Boolean);

  // Specs: [{ name, width, height, unit }]
  const rawSpecs = Array.isArray(raw.specs)
    ? raw.specs
    : raw.targetSpecs && typeof raw.targetSpecs === "object"
    ? [raw.targetSpecs]
    : [];
  const specs = rawSpecs
    .filter((s) => s && typeof s === "object")
    .map((s) => ({
      name: String(s.name || "").trim(),
      width: Number(s.width ?? 0),
      height: Number(s.height ?? 0),
      unit: String(s.unit || "px").trim(),
    }))
    .filter((s) => s.width > 0 && s.height > 0);

  // References: array of asset IDs
  const rawReferences = Array.isArray(raw.references) ? raw.references : [];
  const references = rawReferences
    .map((ref) => (ref != null ? String(ref).trim() : ""))
    .filter(Boolean);

  // Confirmed decisions: [{ text, source, confirmedAt }]
  const rawDecisions = Array.isArray(raw.confirmedDecisions)
    ? raw.confirmedDecisions
    : [];
  const confirmedDecisions = rawDecisions
    .filter((d) => d && (typeof d === "string" || typeof d.text === "string"))
    .map((d) => {
      if (typeof d === "string") {
        return {
          text: d.trim(),
          source: "user",
          confirmedAt: Date.now(),
        };
      }
      return {
        text: String(d.text || "").trim(),
        source: String(d.source || "user").trim(),
        confirmedAt: d.confirmedAt ?? Date.now(),
      };
    })
    .filter((d) => Boolean(d.text));

  const brandRefId =
    typeof raw.brandRefId === "string" && raw.brandRefId.trim()
      ? raw.brandRefId.trim()
      : null;

  return {
    schemaVersion: PROJECT_BRIEF_SCHEMA_VERSION,
    goal,
    audience,
    brand: {
      colors,
      fonts,
      logoAssetId,
      safeArea,
      forbidden,
    },
    brandRefId,
    style,
    specs,
    references,
    confirmedDecisions,
  };
}

/**
 * Validates whether an object adheres to the Project Brief schema.
 *
 * @param {any} brief
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProjectBrief(brief) {
  const errors = [];
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    return { valid: false, errors: ["Brief must be a non-null object"] };
  }

  if (brief.schemaVersion !== PROJECT_BRIEF_SCHEMA_VERSION) {
    errors.push(
      `Unsupported schemaVersion: ${brief.schemaVersion} (expected ${PROJECT_BRIEF_SCHEMA_VERSION})`,
    );
  }

  if (brief.goal != null && typeof brief.goal !== "string") {
    errors.push("goal must be a string");
  }

  if (brief.audience != null && typeof brief.audience !== "string") {
    errors.push("audience must be a string");
  }

  if (brief.style != null && typeof brief.style !== "string") {
    errors.push("style must be a string");
  }

  if (brief.brand != null) {
    if (typeof brief.brand !== "object" || Array.isArray(brief.brand)) {
      errors.push("brand must be an object");
    } else {
      if (brief.brand.colors != null && !Array.isArray(brief.brand.colors)) {
        errors.push("brand.colors must be an array");
      }
      if (brief.brand.fonts != null && !Array.isArray(brief.brand.fonts)) {
        errors.push("brand.fonts must be an array");
      }
      if (brief.brand.forbidden != null && !Array.isArray(brief.brand.forbidden)) {
        errors.push("brand.forbidden must be an array");
      }
      if (brief.brand.safeArea != null) {
        const sa = brief.brand.safeArea;
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
    }
  }

  if (brief.specs != null && !Array.isArray(brief.specs)) {
    errors.push("specs must be an array");
  }

  if (brief.references != null && !Array.isArray(brief.references)) {
    errors.push("references must be an array");
  }

  if (
    brief.confirmedDecisions != null &&
    !Array.isArray(brief.confirmedDecisions)
  ) {
    errors.push("confirmedDecisions must be an array");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Deep sanitizes a Project Brief into canonical structure and types.
 *
 * @param {any} brief
 * @returns {Object}
 */
export function sanitizeProjectBrief(brief) {
  return migrateProjectBrief(brief);
}

/**
 * Merges an incoming patch into the current brief.
 * Explicitly setting a field to empty (e.g. `""`, `[]`, or `null`) overwrites and clears it.
 *
 * @param {Object} currentBrief
 * @param {Object} patch
 * @returns {Object} Updated Project Brief
 */
export function mergeProjectBrief(currentBrief, patch) {
  const current = migrateProjectBrief(currentBrief);
  if (!patch || typeof patch !== "object") return current;

  const result = {
    ...current,
    schemaVersion: PROJECT_BRIEF_SCHEMA_VERSION,
  };

  if ("goal" in patch) {
    result.goal = typeof patch.goal === "string" ? patch.goal.trim() : "";
  }
  if ("audience" in patch) {
    result.audience =
      typeof patch.audience === "string" ? patch.audience.trim() : "";
  }
  if ("style" in patch) {
    result.style = typeof patch.style === "string" ? patch.style.trim() : "";
  }
  if ("brandRefId" in patch) {
    result.brandRefId =
      typeof patch.brandRefId === "string" && patch.brandRefId.trim()
        ? patch.brandRefId.trim()
        : null;
  }

  if ("brand" in patch) {
    if (!patch.brand || typeof patch.brand !== "object") {
      result.brand = {
        colors: [],
        fonts: [],
        logoAssetId: null,
        safeArea: null,
        forbidden: [],
      };
    } else {
      const curBrand = result.brand;
      const pBrand = patch.brand;
      const updatedBrand = { ...curBrand };

      if ("colors" in pBrand) {
        updatedBrand.colors = Array.isArray(pBrand.colors)
          ? pBrand.colors
              .map((c) =>
                typeof c === "string"
                  ? { hex: c.trim(), role: "" }
                  : { hex: String(c?.hex || "").trim(), role: String(c?.role || "").trim() },
              )
              .filter((c) => Boolean(c.hex))
          : [];
      }

      if ("fonts" in pBrand) {
        updatedBrand.fonts = Array.isArray(pBrand.fonts)
          ? pBrand.fonts
              .map((f) =>
                typeof f === "string"
                  ? { family: f.trim(), role: "" }
                  : { family: String(f?.family || "").trim(), role: String(f?.role || "").trim() },
              )
              .filter((f) => Boolean(f.family))
          : [];
      }

      if ("logoAssetId" in pBrand) {
        updatedBrand.logoAssetId =
          typeof pBrand.logoAssetId === "string" && pBrand.logoAssetId.trim()
            ? pBrand.logoAssetId.trim()
            : null;
      }

      if ("safeArea" in pBrand) {
        const sa = pBrand.safeArea;
        if (!sa || typeof sa !== "object") {
          updatedBrand.safeArea = null;
        } else {
          updatedBrand.safeArea = {
            top: Number(sa.top ?? 0),
            right: Number(sa.right ?? 0),
            bottom: Number(sa.bottom ?? 0),
            left: Number(sa.left ?? 0),
          };
        }
      }

      if ("forbidden" in pBrand) {
        updatedBrand.forbidden = Array.isArray(pBrand.forbidden)
          ? pBrand.forbidden
              .map((item) => (item != null ? String(item).trim() : ""))
              .filter(Boolean)
          : [];
      }

      result.brand = updatedBrand;
    }
  }

  if ("specs" in patch) {
    result.specs = Array.isArray(patch.specs)
      ? patch.specs
          .filter((s) => s && typeof s === "object")
          .map((s) => ({
            name: String(s.name || "").trim(),
            width: Number(s.width ?? 0),
            height: Number(s.height ?? 0),
            unit: String(s.unit || "px").trim(),
          }))
          .filter((s) => s.width > 0 && s.height > 0)
      : [];
  }

  if ("references" in patch) {
    result.references = Array.isArray(patch.references)
      ? patch.references
          .map((r) => (r != null ? String(r).trim() : ""))
          .filter(Boolean)
      : [];
  }

  if ("confirmedDecisions" in patch) {
    result.confirmedDecisions = Array.isArray(patch.confirmedDecisions)
      ? patch.confirmedDecisions
          .filter((d) => d && (typeof d === "string" || typeof d.text === "string"))
          .map((d) => {
            if (typeof d === "string") {
              return { text: d.trim(), source: "user", confirmedAt: Date.now() };
            }
            return {
              text: String(d.text || "").trim(),
              source: String(d.source || "user").trim(),
              confirmedAt: d.confirmedAt ?? Date.now(),
            };
          })
          .filter((d) => Boolean(d.text))
      : [];
  }

  return result;
}

/**
 * Formats non-empty fields of a Project Brief into a structured text section for the LLM system prompt.
 * If all fields are empty, returns an empty string.
 *
 * @param {Object} brief
 * @returns {string} Formatted markdown prompt section or empty string.
 */
export function formatProjectBriefForPrompt(brief) {
  if (!brief || typeof brief !== "object") return "";

  const lines = [];

  if (typeof brief.goal === "string" && brief.goal.trim()) {
    lines.push(`- **Goal**: ${brief.goal.trim()}`);
  }

  if (typeof brief.audience === "string" && brief.audience.trim()) {
    lines.push(`- **Audience**: ${brief.audience.trim()}`);
  }

  if (typeof brief.style === "string" && brief.style.trim()) {
    lines.push(`- **Style**: ${brief.style.trim()}`);
  }

  if (brief.brand && typeof brief.brand === "object") {
    const brandLines = [];
    if (Array.isArray(brief.brand.colors) && brief.brand.colors.length > 0) {
      const colorStr = brief.brand.colors
        .map((c) => (c.role ? `${c.hex} (${c.role})` : c.hex))
        .join(", ");
      brandLines.push(`  - Colors: ${colorStr}`);
    }
    if (Array.isArray(brief.brand.fonts) && brief.brand.fonts.length > 0) {
      const fontStr = brief.brand.fonts
        .map((f) => (f.role ? `${f.family} (${f.role})` : f.family))
        .join(", ");
      brandLines.push(`  - Fonts: ${fontStr}`);
    }
    if (typeof brief.brand.logoAssetId === "string" && brief.brand.logoAssetId.trim()) {
      brandLines.push(`  - Logo Asset: ${brief.brand.logoAssetId.trim()}`);
    }
    if (brief.brand.safeArea && typeof brief.brand.safeArea === "object") {
      const sa = brief.brand.safeArea;
      brandLines.push(
        `  - Safe Area: top ${sa.top}px, right ${sa.right}px, bottom ${sa.bottom}px, left ${sa.left}px`,
      );
    }
    if (Array.isArray(brief.brand.forbidden) && brief.brand.forbidden.length > 0) {
      brandLines.push(`  - Forbidden: ${brief.brand.forbidden.join(", ")}`);
    }

    if (brandLines.length > 0) {
      lines.push("- **Brand Guidelines**:\n" + brandLines.join("\n"));
    }
  }

  if (Array.isArray(brief.specs) && brief.specs.length > 0) {
    const specItems = brief.specs.map(
      (s) => `${s.name ? `${s.name}: ` : ""}${s.width}x${s.height}${s.unit || "px"}`,
    );
    lines.push(`- **Output Specs**: ${specItems.join("; ")}`);
  }

  if (Array.isArray(brief.references) && brief.references.length > 0) {
    lines.push(`- **Reference Assets**: ${brief.references.join(", ")}`);
  }

  if (
    Array.isArray(brief.confirmedDecisions) &&
    brief.confirmedDecisions.length > 0
  ) {
    const decisionLines = brief.confirmedDecisions.map(
      (d) => `  - [${d.source || "user"}] ${d.text}`,
    );
    lines.push("- **Confirmed Decisions**:\n" + decisionLines.join("\n"));
  }

  if (lines.length === 0) return "";

  return [
    "## Project Brief",
    "Adhere to the following confirmed project specifications and brand constraints:",
    ...lines,
  ].join("\n");
}
