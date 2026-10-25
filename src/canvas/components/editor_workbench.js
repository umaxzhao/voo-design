/**
 * Workbench presets: what the editor chrome shows for each canvas type.
 *
 * A canvas type is a preset over one document model, not a different editor.
 * Every surface decision that used to be a scattered `canvasType === ...`
 * check lives in this table, so adding or changing a mode is a one-row edit
 * and switching types never has to rebuild the editor.
 */
import { CANVAS_TYPE } from "../editor/scene_doc_factory.js";

/**
 * @typedef {object} Workbench
 * @property {boolean} timelineOpen  Motion timeline opens when the mode is entered.
 * @property {boolean} inspectorAlwaysOpen  Properties panel stays open without a selection.
 * @property {"design"|"motion"|"three"} toolbar  Which tool bar the mode carries.
 * @property {boolean} pieMenu  Radial tool menu is available.
 * @property {boolean} sceneInspector  Scene-level 3D inspector replaces the 2D one.
 * @property {boolean} timelineInspector  Timeline settings panel replaces the 2D one.
 * @property {boolean} wideLayersRail  Layers rail stays visible on wide stages.
 */

/** @type {Readonly<Record<string, Readonly<Workbench>>>} */
export const WORKBENCHES = Object.freeze({
  [CANVAS_TYPE.DESIGN]: Object.freeze({
    timelineOpen: false,
    inspectorAlwaysOpen: false,
    toolbar: "design",
    pieMenu: true,
    sceneInspector: false,
    timelineInspector: false,
    wideLayersRail: false,
  }),
});

/** Unknown types fail loudly: a silent design fallback would hide bad data. */
export function getWorkbench(canvasType) {
  const workbench = WORKBENCHES[canvasType];
  if (!workbench) {
    throw new RangeError(`No workbench for canvas type: ${canvasType}`);
  }
  return workbench;
}
