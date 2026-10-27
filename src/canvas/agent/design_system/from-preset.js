/**
 * Converts a built-in artifact design system (src/canvas/design_systems.js)
 * into the agent's v1 design-system contract.
 *
 * The artifact preset is the product-facing source of truth (tokens for the
 * settings UI and the generated brief); the contract is the strict subset the
 * agent prompt and the HTML pipeline validate against. This adapter keeps the
 * two from drifting.
 */
import { DESIGN_SYSTEM_VERSION, validateDesignSystem } from "./schema.js";
import { buildDesignSystemBrief, designSystemColors } from "../../design_systems.js";
import { contrastRatio } from "../design_quality/tokens.js";

function px(scale, value) {
  return typeof value === "number" ? value : scale[value];
}

function scaleEntry(fontSize, fontWeight, lineHeight) {
  return {
    fontSize: Math.round(fontSize),
    lineHeight: Math.round(fontSize * lineHeight),
    fontWeight,
    letterSpacing: 0,
  };
}

/**
 * @param {object} system a DESIGN_SYSTEMS entry
 * @param {{locale?: "zh"|"en"}} [options] brief language
 * @returns {object} validated v1 design-system contract
 */
export function fromDesignSystemPreset(system, { locale = "en", name = null } = {}) {
  if (!system?.tokens?.primitive || !system?.tokens?.component) {
    throw new Error("design-system-preset-invalid");
  }
  const { primitive, component } = system.tokens;
  const colors = designSystemColors(system);
  const { radius } = primitive;
  const type = primitive.type.desktop;
  const isDark =
    contrastRatio("#FFFFFF", colors.surface) > contrastRatio("#000000", colors.surface);

  const contract = {
    version: DESIGN_SYSTEM_VERSION,
    id: system.id,
    name: name ?? system.id,
    colorMode: isDark ? "dark" : "light",
    colors: {
      primary: colors.action,
      onPrimary: colors.actionText,
      secondary: colors.surfaceMuted,
      onSecondary: colors.text,
      tertiary: colors.textMuted,
      onTertiary: colors.canvas,
      neutral: colors.textMuted,
      surface: colors.surface,
      surfaceVariant: colors.surfaceMuted,
      onSurface: colors.text,
      onSurfaceVariant: colors.textMuted,
      outline: colors.divider,
      error: colors.action,
      onError: colors.actionText,
      background: colors.canvas,
    },
    typography: {
      fontHeadline: primitive.fonts.heading,
      fontBody: primitive.fonts.body,
      fontLabel: primitive.fonts.label ?? primitive.fonts.body,
      scale: {
        displayLg: scaleEntry(type.display, 600, 1.04),
        headlineLg: scaleEntry(type.title, 600, 1.12),
        headlineMd: scaleEntry(type.title * 0.8, 600, 1.18),
        titleMd: scaleEntry(type.body * 1.35, 600, 1.3),
        bodyLg: scaleEntry(type.body + 2, 400, 1.55),
        bodyMd: scaleEntry(type.body, 400, 1.6),
        labelLg: scaleEntry(type.caption + 1, 500, 1.4),
        labelSm: scaleEntry(type.caption, 500, 1.4),
      },
    },
    spacing: {
      unit: 4,
      scale: [0, ...new Set(Object.values(primitive.spacing))].sort((a, b) => a - b),
    },
    roundness: {
      none: 0,
      sm: px(radius, component.button.radius),
      md: px(radius, component.card.radius),
      lg: px(radius, "panel"),
      full: px(radius, radius.pill),
    },
    elevation: { sm: "none", md: "none" },
    components: {
      button: {
        radius: px(radius, component.button.radius),
        paddingX: px(primitive.spacing, component.button.paddingX),
        paddingY: Math.max(4, Math.round((component.button.height - 16) / 2)),
        fontRole: "labelLg",
      },
      card: {
        radius: px(radius, component.card.radius),
        padding: px(primitive.spacing, component.card.padding),
        elevation: "none",
      },
      input: {
        radius: px(radius, component.input.radius),
        height: component.input.height,
        border: 1,
      },
      chip: { radius: px(radius, radius.pill) },
    },
    designMd: buildDesignSystemBrief({ ...system, id: name ?? system.id }, { locale }),
  };

  const result = validateDesignSystem(contract);
  if (!result.ok) {
    throw new Error(`design-system-preset-invalid:${result.errors.join("; ")}`);
  }
  return { ...result.value, warnings: result.warnings };
}

