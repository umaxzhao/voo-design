/**
 * Selection-domain API extracted from the createEditor closure.
 *
 * This module acts as the public facade, delegating to focused sub-modules:
 * - selection_api_modify.js: feathering, modification, smoothing, border, combination, inversion
 * - selection_api_move.js: preview and move operations on selected pixels
 * - selection_api_lasso.js: marquee mode/ratio, polygonal lasso, and wand settings
 */

import { commitEditorAction } from "../undo-action-contracts.js";
import { createSelectionApiModify } from "./selection_api_modify.js";
import { createSelectionApiMove } from "./selection_api_move.js";
import { createSelectionApiLasso } from "./selection_api_lasso.js";

export function createSelectionApi(context) {
  const commitMovePixels = (fn) =>
    commitEditorAction("editor.selection.movePixels", fn);

  const api = {};

  const modifyApi = createSelectionApiModify(context, api);
  const moveApi = createSelectionApiMove({
    ...context,
    commitMovePixels,
  });
  const lassoApi = createSelectionApiLasso(context, api);

  Object.assign(api, modifyApi, moveApi, lassoApi);
  return api;
}
