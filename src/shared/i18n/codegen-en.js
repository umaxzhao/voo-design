/**
 * English dictionary slice for "Export design to code".
 *
 * Kept separate from en.js so the code-export surface can be reviewed on its
 * own. The Lead wires this slice into the aggregate dictionary; keys use the
 * `editor.codegen.*` namespace.
 */
export default {
  "editor.codegen.title": "Export design to code",
  "editor.codegen.subtitle":
    "Tailwind, React or plain CSS from the selected layers.",
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
  "editor.codegen.resolving": "Resolving image assets...",
  "editor.codegen.error": "This document could not be exported.",
  "editor.codegen.copyAction": "Copy code",
  "editor.codegen.exportAction": "Export design to code...",
  "editor.codegen.warn.emptySelection":
    "Nothing is selected; exported the whole page instead.",
  "editor.codegen.warn.emptyPage":
    "The page has no visible layers; exported an empty frame.",
  "editor.codegen.warn.imageMissing":
    "Image layer has no resolvable bytes; exported a neutral placeholder.",
  "editor.codegen.warn.imageCropApproximated":
    "Image crop is approximated because the source pixel size is unknown.",
  "editor.codegen.warn.imageEffectsSkipped":
    "Image adjustments could not be baked into code; exported the raw pixels.",
  "editor.codegen.warn.videoMissing":
    "Video layer has no safe source; exported a placeholder.",
  "editor.codegen.warn.videoBestEffort":
    "Video is exported muted, looping and autoplaying; playback controls are not reproduced.",
  "editor.codegen.warn.adjustmentSkipped":
    "Adjustment layer skipped; adjustment layers have no CSS equivalent.",
  "editor.codegen.warn.regionSkipped":
    "Region layer skipped; regions are AI editing guides, not artwork.",
  "editor.codegen.warn.canvasInstancePlaceholder":
    "Canvas instance flattened to a placeholder; nested canvases are not inlined.",
  "editor.codegen.warn.unsupportedNode":
    "Unsupported layer kind exported as a placeholder.",
  "editor.codegen.warn.effectsSkipped":
    "Some layer effects (inner shadow, bevel, satin, overlay) have no CSS equivalent and were skipped.",
  "editor.codegen.warn.textEffectsSkipped":
    "Some text effects (highlight, baseline shift) have no CSS equivalent and were skipped.",
  "editor.codegen.warn.maskSkipped":
    "Layer mask skipped; the exported layer is unmasked.",
  "editor.codegen.warn.clipSkipped":
    "Layer clip was skipped; clipping paths are not reproduced.",
  "editor.codegen.warn.blendModeUnsupported":
    "Layer blend mode has no Tailwind equivalent; exported with normal blending.",
  "editor.codegen.warn.vectorMissing":
    "Vector layer produced no drawable geometry; exported a placeholder.",
};
