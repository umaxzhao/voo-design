/**
 * English dictionary slice for "Export design to code".
 *
 * Kept separate from en.js so the code-export surface can be reviewed on its
 * own. The Lead wires this slice into the aggregate dictionary; keys use the
 * `editor.codegen.*` namespace.
 */
export default {
  "editor.codegen.title": "Export code",
  "editor.codegen.close": "Close",
  "editor.codegen.format": "Format",
  "editor.codegen.format.tailwind": "HTML + Tailwind",
  "editor.codegen.format.react": "React",
  "editor.codegen.format.css": "Plain CSS",
  "editor.codegen.scope": "Scope",
  "editor.codegen.scope.selection": "Selection",
  "editor.codegen.scope.page": "Page",
  "editor.codegen.layers": "layers",
  "editor.codegen.wholePage": "Whole page",
  "editor.codegen.warnings": "Warnings",
  "editor.codegen.noWarnings": "No lossy layers",
  "editor.codegen.copy": "Copy code",
  "editor.codegen.copied": "Copied",
  "editor.codegen.copyFailed": "Copy failed",
  "editor.codegen.download": "Download",
  "editor.codegen.preview": "Code preview",
  "editor.codegen.resolving": "Loading images…",
  "editor.codegen.error": "Could not export document.",
  "editor.codegen.copyAction": "Copy code",
  "editor.codegen.exportAction": "Export code…",
  "editor.codegen.warn.emptySelection":
    "No selection; exported the whole page.",
  "editor.codegen.warn.emptyPage":
    "No visible layers; exported an empty frame.",
  "editor.codegen.warn.imageMissing":
    "Image unavailable; exported a placeholder.",
  "editor.codegen.warn.imageCropApproximated":
    "Unknown image size; crop approximated.",
  "editor.codegen.warn.imageEffectsSkipped":
    "Image adjustments skipped; exported original pixels.",
  "editor.codegen.warn.videoMissing":
    "Video source unavailable; exported a placeholder.",
  "editor.codegen.warn.videoBestEffort":
    "Video autoplays muted on loop, without controls.",
  "editor.codegen.warn.adjustmentSkipped":
    "Adjustment layer skipped: no CSS equivalent.",
  "editor.codegen.warn.regionSkipped":
    "Region skipped: editing guide only.",
  "editor.codegen.warn.canvasInstancePlaceholder":
    "Nested canvas exported as a placeholder.",
  "editor.codegen.warn.unsupportedNode":
    "Unsupported layer exported as a placeholder.",
  "editor.codegen.warn.effectsSkipped":
    "Some layer effects (inner shadow, bevel, satin, overlay) have no CSS equivalent and were skipped.",
  "editor.codegen.warn.textEffectsSkipped":
    "Some text effects (highlight, baseline shift) have no CSS equivalent and were skipped.",
  "editor.codegen.warn.maskSkipped":
    "Mask skipped; layer exported unmasked.",
  "editor.codegen.warn.clipSkipped":
    "Clipping path skipped.",
  "editor.codegen.warn.blendModeUnsupported":
    "Blend mode unsupported in Tailwind; using Normal.",
  "editor.codegen.warn.vectorMissing":
    "No vector geometry; exported a placeholder.",
};
