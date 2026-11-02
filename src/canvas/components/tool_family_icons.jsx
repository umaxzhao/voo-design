/**
 * Maps the `icon` name strings in `tool_families.js` onto icon components.
 *
 * The family definitions live in `src/canvas/editor/`, which must stay
 * React-free, so they can only name an icon — never hold the component. Every
 * surface that renders a family's items (properties panel, keyboard pie menu) has
 * to resolve the name through this one table.
 *
 * It exists because the pie menu did `const Icon = item.icon` and rendered the
 * bare string: React treats `<cursor />` as an unknown lowercase DOM tag, so it
 * silently drew nothing and every pie-menu icon vanished without an error.
 */
import {
  IconArrowUpRight,
  IconBrush,
  IconBucket,
  IconCircle,
  IconCone,
  IconCursor,
  IconDistort,
  IconDroplet,
  IconEdit,
  IconGradient,
  IconHealAi,
  IconHealClone,
  IconHealPatch,
  IconHealSpot,
  IconMoon,
  IconMagnet,
  IconObjectSelection,
  IconPalette,
  IconPen,
  IconPerspective,
  IconPin,
  IconPipette,
  IconPointer,
  IconSelectionEllipse,
  IconSelectionFree,
  IconSelectionPolygon,
  IconSelectionRect,
  IconSlash,
  IconSparkle,
  IconSquare,
  IconStar,
  IconSun,
  IconTriangle,
  IconWand,
} from "../icons.jsx";

export const TOOL_FAMILY_ICONS = {
  cursor: IconCursor,
  selectionRect: IconSelectionRect,
  selectionEllipse: IconSelectionEllipse,
  selectionFree: IconSelectionFree,
  selectionPolygon: IconSelectionPolygon,
  selectionMagnetic: IconMagnet,
  wand: IconWand,
  objectSelection: IconObjectSelection,
  perspective: IconPerspective,
  distort: IconDistort,
  pin: IconPin,
  brush: IconBrush,
  pointer: IconPointer,
  droplet: IconDroplet,
  cone: IconCone,
  sun: IconSun,
  moon: IconMoon,
  palette: IconPalette,
  sparkle: IconSparkle,
  healSpot: IconHealSpot,
  healAi: IconHealAi,
  healPatch: IconHealPatch,
  healClone: IconHealClone,
  pen: IconPen,
  edit: IconEdit,
  square: IconSquare,
  circle: IconCircle,
  slash: IconSlash,
  triangle: IconTriangle,
  star: IconStar,
  arrowUpRight: IconArrowUpRight,
  pipette: IconPipette,
  dropper: IconPipette,
  bucket: IconBucket,
  fill: IconBucket,
  gradient: IconGradient,
};

/** Resolves a family item's icon name; falls back to the cursor glyph. */
export function toolFamilyIcon(name) {
  return TOOL_FAMILY_ICONS[name] || IconCursor;
}
