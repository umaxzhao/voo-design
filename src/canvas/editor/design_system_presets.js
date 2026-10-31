import { getLocale } from "../../shared/i18n.js";
import {
  DESIGN_SYSTEMS,
  buildDesignSystemBrief,
  designSystemColors,
} from "../design_systems.js";

/** Resolve a token alias ("xl", "control") to px; literal numbers pass through. */
function px(scale, value) {
  return typeof value === "number" ? value : scale[value];
}

/**
 * Convert a built-in preset (primitive/semantic/component layers in
 * `design_systems.js`) into the document model that is applied to a page:
 * `designTokens` + `designMd`. The preset file stays the single source of
 * truth, this adapter only reshapes it.
 */
export function presetToDocumentSystem(system) {
  const { primitive, component } = system.tokens;
  const typeSizes = [
    ...Object.values(primitive.type.desktop),
    ...Object.values(primitive.type.mobile),
  ];
  const { spacing, radius } = primitive;
  const designTokens = {
    colors: designSystemColors(system),
    typeScale: [...new Set(typeSizes)].sort((a, b) => a - b),
    spacing: [0, ...Object.values(spacing)].sort((a, b) => a - b),
    radius: { ...radius },
    components: {
      button: {
        radius: px(radius, component.button.radius),
        paddingX: px(spacing, component.button.paddingX),
        height: component.button.height,
      },
      card: {
        radius: px(radius, component.card.radius),
        padding: px(spacing, component.card.padding),
      },
      navigation: { height: component.navigation.height },
      input: {
        radius: px(radius, component.input.radius),
        height: component.input.height,
      },
    },
  };
  return Object.freeze({
    id: system.id,
    builtIn: true,
    nameKey: system.labelKey,
    descriptionKey: system.descriptionKey,
    coverImage: system.coverImage,
    sourceName: system.sourceName,
    sourceUrl: system.sourceUrl,
    designTokens,
    // A getter, not a snapshot: the brief follows the UI locale at the moment
    // it is shown in the editor or applied to a document.
    get designMd() {
      return buildDesignSystemBrief(system, { locale: getLocale() });
    },
  });
}

/** The read-only presets, in the declaration order of `DESIGN_SYSTEMS`. */
export const BUILT_IN_DESIGN_SYSTEMS = Object.freeze(
  Object.values(DESIGN_SYSTEMS).map(presetToDocumentSystem),
);
