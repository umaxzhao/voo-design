/**
 * Canonical targeting resolver for multi-artboard editor bridges (P1b).
 *
 * Resolves the explicit target bridge for a command from `editorBridges`.
 *
 * Enforces:
 * 1. Explicit target identity: Callers (UI focus or agent) must provide
 *    an explicit target artboard identifier (`targetNodeId`, `targetWorkflowNodeId`,
 *    or `sourceWorkflowNodeId`). Reading from a global singleton (`editorBridge`)
 *    is strictly prohibited.
 * 2. Multi-board protection: When multiple artboards are open, stripping or
 *    omitting the target identifier throws `TARGET_NODE_ID_REQUIRED` so commands
 *    never silently guess or mutate the wrong artboard.
 * 3. Destroyed / recycled protection: If the specified target does not exist or
 *    has been destroyed/recycled, throws `EDITOR_NOT_OPEN` with `targetNodeId`,
 *    never falling back to another artboard.
 */

export function extractCommandTargetNodeId(command) {
  if (!command || typeof command !== "object") return null;
  return (
    command.targetNodeId ??
    command.targetWorkflowNodeId ??
    command.sourceWorkflowNodeId ??
    command.args?.targetNodeId ??
    command.args?.targetWorkflowNodeId ??
    command.args?.sourceWorkflowNodeId ??
    null
  );
}

export function resolveTargetEditorBridge(
  storeOrBridges,
  command = {},
  options = {},
) {
  const bridges =
    storeOrBridges?.editorBridges ??
    storeOrBridges?.bridges ??
    (storeOrBridges && typeof storeOrBridges === "object"
      ? storeOrBridges
      : {});

  // Extract explicit target identifier from command or caller options
  const targetNodeId =
    extractCommandTargetNodeId(command) ??
    options?.targetNodeId ??
    (command?.nodeId && bridges[command.nodeId] ? command.nodeId : null);

  const bridgeKeys = Object.keys(bridges).filter(
    (key) => bridges[key] && typeof bridges[key].execute === "function",
  );

  const isMultiBoard = bridgeKeys.length > 1;

  if (targetNodeId) {
    const bridge = bridges[targetNodeId] ?? null;
    if (!bridge || typeof bridge.execute !== "function") {
      throw Object.assign(
        new Error(
          `Image editor for node "${targetNodeId}" is not open or has been recycled.`,
        ),
        {
          code: "EDITOR_NOT_OPEN",
          targetNodeId,
        },
      );
    }
    return bridge;
  }

  // Target identifier was NOT provided by caller
  if (isMultiBoard) {
    throw Object.assign(
      new Error(
        "Multi-board command targeting requires an explicit targetNodeId (artboard identifier). Reading from global or implicit active editor is prohibited.",
      ),
      {
        code: "TARGET_NODE_ID_REQUIRED",
        missing: { targetNodeId: ["required"] },
        suggestion: {
          note: "Specify targetNodeId in command payload or args matching the intended artboard.",
        },
      },
    );
  }

  // Single-board mode fallback (only 1 bridge open)
  if (bridgeKeys.length === 1) {
    return bridges[bridgeKeys[0]];
  }

  // No bridge open
  throw Object.assign(new Error("Editor is not open."), {
    code: "EDITOR_NOT_OPEN",
  });
}

/**
 * Resolves whether an artboard's screen rectangle intersects the current viewport.
 *
 * @param {Object} params
 * @param {Object} params.layout - Artboard layout in canvas-space { x, y, width, height }
 * @param {Object} params.camera - Free camera { zoom, panX, panY }
 * @param {Object} [params.viewport] - Stage viewport dimensions { width, height }
 * @param {number} [params.margin=80] - Buffer margin around viewport in px
 * @returns {boolean}
 */
export function isArtboardInViewport({
  layout,
  camera,
  viewport = null,
  margin = 80,
}) {
  if (!layout || !camera) return true;
  const zoom = camera.zoom ?? 1;
  const panX = camera.panX ?? 0;
  const panY = camera.panY ?? 0;
  const vpWidth = viewport?.width ?? 1440;
  const vpHeight = viewport?.height ?? 900;

  const screenX = panX + (layout.x ?? 0) * zoom;
  const screenY = panY + (layout.y ?? 0) * zoom;
  const screenW = (layout.width ?? 1024) * zoom;
  const screenH = (layout.height ?? 1024) * zoom;

  return (
    screenX + screenW >= -margin &&
    screenX <= vpWidth + margin &&
    screenY + screenH >= -margin &&
    screenY <= vpHeight + margin
  );
}

/**
 * Resolves whether a specific artboard is affected by a given update or command.
 *
 * 1. If `targetNodeId` is explicitly specified (command targeting or single-board operation),
 *    ONLY the matching artboard is affected.
 * 2. If no targetNodeId is specified (e.g. camera pan, zoom, or viewport resize),
 *    evaluates viewport visibility so only in-viewport artboards receive notifications.
 */
export function isArtboardAffected({
  nodeId,
  targetNodeId = null,
  layout = null,
  camera = null,
  viewport = null,
  margin = 80,
}) {
  if (targetNodeId) {
    return nodeId === targetNodeId;
  }
  if (layout && camera) {
    return isArtboardInViewport({ layout, camera, viewport, margin });
  }
  return true;
}

/**
 * Resolves the array of artboard IDs that are affected by the given target or camera change.
 */
export function resolveAffectedArtboardIds({
  nodeIds = [],
  targetNodeId = null,
  layouts = null,
  camera = null,
  viewport = null,
  margin = 80,
}) {
  if (targetNodeId) {
    return nodeIds.filter((id) => id === targetNodeId);
  }
  if (!layouts || !camera) {
    return [...nodeIds];
  }
  return nodeIds.filter((nodeId) => {
    const layout =
      layouts instanceof Map ? layouts.get(nodeId) : layouts[nodeId];
    return isArtboardAffected({
      nodeId,
      targetNodeId: null,
      layout,
      camera,
      viewport,
      margin,
    });
  });
}

/**
 * Calculates the screen-space bounding rect of an artboard given layout and camera.
 */
export function calculateArtboardScreenRect(layout, camera) {
  if (!layout) return null;
  const zoom = camera?.zoom ?? 1;
  const panX = camera?.panX ?? 0;
  const panY = camera?.panY ?? 0;
  return {
    x: panX + (layout.x ?? 0) * zoom,
    y: panY + (layout.y ?? 0) * zoom,
    width: (layout.width ?? 1024) * zoom,
    height: (layout.height ?? 1024) * zoom,
  };
}

/**
 * Calculates the local layer-space bounding rect of an artboard (independent of camera pan).
 */
export function calculateArtboardLocalRect(layout, camera) {
  if (!layout) return null;
  const zoom = camera?.zoom ?? 1;
  return {
    x: (layout.x ?? 0) * zoom,
    y: (layout.y ?? 0) * zoom,
    width: (layout.width ?? 1024) * zoom,
    height: (layout.height ?? 1024) * zoom,
  };
}
