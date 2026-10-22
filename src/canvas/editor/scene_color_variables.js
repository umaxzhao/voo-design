/**
 * Compatibility shim for the original v1 colour-variable module.
 *
 * The implementation now lives in `scene_variables.js`, which is a strict
 * superset of this API: when a document has a variables-v2 model the legacy
 * operations read/write the legacy "Colors" collection (keeping
 * `doc.colorVariables` as the v1 mirror), otherwise they behave exactly like
 * the v1 functions. Existing call sites (`image_editor.jsx`,
 * `scene_model_serialization.js`) keep importing from here unchanged.
 */

export {
  normalizeColorVariables,
  normalizeColorVariablesV1,
  addColorVariable,
  bindColorVariable,
  deleteColorVariable,
  updateColorVariable,
  seedDesignSystemColorVariables,
} from "./scene_variables.js";
