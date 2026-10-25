/**
 * Document transforms, as pure functions.
 *
 * Facade module re-exporting all document operations.
 */

export {
  addNode,
  duplicateNode,
  frameAtPoint,
  imageNodeUnder,
  makeCentredImageNode,
  nodeAtPoint,
  removeNode,
  updateDocument,
  updateNode,
  updateNodes,
  withNodes,
} from "./doc_ops_nodes.js";

export {
  clipBaseBelow,
  clipNodeInto,
  createClippingMasks,
  releaseClippingMasks,
  releaseClippingMasksTo,
} from "./doc_ops_clipping.js";

export {
  combineNodes,
  extremeOrder,
  insertGroup,
  moveIntoGroup,
  moveNodeToExtreme,
  moveNodeToRoot,
  pruneEmptyGroups,
  reorderGroupTo,
  reorderNode,
  reorderNodeTo,
  ungroupNodes,
} from "./doc_ops_groups.js";

export {
  moveAffectedIds,
  moveNodeBy,
  moveWithFollowers,
} from "./doc_ops_move.js";

export {
  cropDocument,
  resizeDocumentEdges,
  setBackgroundColor,
  setDocumentSize,
} from "./doc_ops_canvas.js";

export {
  attachRegionsToHosts,
  regionHost,
  regionLocalPoint,
  regionOutlineInDoc,
} from "./doc_ops_regions.js";

export { nodesWithin } from "./doc_ops_selection.js";
