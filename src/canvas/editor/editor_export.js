/**
 * Full-resolution render-outs of the document.
 *
 * Facade module re-exporting selection bounds and export APIs.
 */

import { isDeformed } from "./scene_state_contract.js";

export { isDeformed };
export { selectionBounds } from "./editor_export_bounds.js";
export { createExport } from "./editor_export_raster.js";
export { createExportApi } from "./editor_export_api.js";
