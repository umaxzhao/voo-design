import { commitWorkflowGesture } from "../undo-action-contracts.js";

function generateAnnotationId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(value, min = 0, max = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

/**
 * Creates a normalized annotation object.
 * Coordinates x and y are clamped to [0, 1].
 * For box annotations, width and height are clamped to [0.01, 1].
 */
export function createAnnotation({
  x,
  y,
  width = null,
  height = null,
  type = "point",
  note = "",
  id = null,
} = {}) {
  const isBox = type === "box" || (width != null && height != null);
  const base = {
    id: id || generateAnnotationId(),
    type: isBox ? "box" : "point",
    x: clamp(x),
    y: clamp(y),
    note: typeof note === "string" ? note.trim() : "",
  };

  if (isBox) {
    const clampedW = clamp(width ?? 0.1, 0.01, 1);
    const clampedH = clamp(height ?? 0.1, 0.01, 1);
    base.x = clamp(base.x, 0, 1 - clampedW);
    base.y = clamp(base.y, 0, 1 - clampedH);
    base.width = clampedW;
    base.height = clampedH;
  }

  return base;
}

/**
 * Returns a new array with the annotation appended.
 */
export function addAnnotation(
  annotations,
  {
    x,
    y,
    width = null,
    height = null,
    type = "point",
    note = "",
    id = null,
  } = {},
) {
  const current = Array.isArray(annotations) ? [...annotations] : [];
  current.push(createAnnotation({ x, y, width, height, type, note, id }));
  return current;
}

/**
 * Moves or resizes an annotation by id to new normalized coordinates (x, y, width, height in [0, 1]).
 */
export function moveAnnotation(annotations, id, { x, y, width, height }) {
  if (!Array.isArray(annotations)) return [];
  return annotations.map((ann) => {
    if (ann.id !== id) return ann;
    const isBox = ann.type === "box" || ann.width != null;
    if (isBox) {
      const nextW = width != null ? clamp(width, 0.01, 1) : ann.width || 0.1;
      const nextH = height != null ? clamp(height, 0.01, 1) : ann.height || 0.1;
      const nextX = x != null ? clamp(x, 0, 1 - nextW) : ann.x;
      const nextY = y != null ? clamp(y, 0, 1 - nextH) : ann.y;
      return {
        ...ann,
        x: nextX,
        y: nextY,
        width: nextW,
        height: nextH,
      };
    }
    return {
      ...ann,
      x: clamp(x),
      y: clamp(y),
    };
  });
}

/**
 * Updates an annotation's note by id.
 */
export function updateAnnotationNote(annotations, id, note) {
  if (!Array.isArray(annotations)) return [];
  return annotations.map((ann) => {
    if (ann.id !== id) return ann;
    return {
      ...ann,
      note: typeof note === "string" ? note : "",
    };
  });
}

/**
 * Removes an annotation by id.
 * Array positions renumber automatically (1-based index).
 */
export function removeAnnotation(annotations, id) {
  if (!Array.isArray(annotations)) return [];
  return annotations.filter((ann) => ann.id !== id);
}

/**
 * Formats a composite mention ID for a node and annotation: `${nodeId}#${annotationId}`
 */
export function formatMentionId(nodeId, annotationId) {
  if (!nodeId || !annotationId) return "";
  return `${nodeId}#${annotationId}`;
}

/**
 * Parses a composite mention ID into `{ nodeId, annotationId }`.
 * Returns null if the string is not a composite ID.
 */
export function parseMentionId(mentionId) {
  if (typeof mentionId !== "string") return null;
  const hashIndex = mentionId.indexOf("#");
  if (hashIndex === -1) return null;
  const nodeId = mentionId.slice(0, hashIndex);
  const annotationId = mentionId.slice(hashIndex + 1);
  if (!nodeId || !annotationId) return null;
  return { nodeId, annotationId };
}

/**
 * Formats user-visible mention label for an annotation.
 */
export function formatAnnotationLabel(
  imageLabel,
  index,
  markerPrefix = "标注",
) {
  return `${imageLabel}·${markerPrefix}${index}`;
}

/**
 * Finds 1-based index of an annotation in a list of annotations.
 * Returns 0 if not found.
 */
export function getAnnotationIndex(annotations, id) {
  if (!Array.isArray(annotations)) return 0;
  const index = annotations.findIndex((ann) => ann.id === id);
  return index === -1 ? 0 : index + 1;
}

/**
 * Computes deterministic hash of annotations for cache invalidation.
 */
export function computeAnnotationsHash(annotations) {
  if (!Array.isArray(annotations) || annotations.length === 0) return "";
  return annotations
    .map((a) => {
      const isBox = a.type === "box" || (a.width != null && a.height != null);
      if (isBox) {
        return `${a.id}:box:${Number(a.x || 0).toFixed(4)}:${Number(a.y || 0).toFixed(4)}:${Number(a.width || 0).toFixed(4)}:${Number(a.height || 0).toFixed(4)}:${(a.note || "").trim()}`;
      }
      return `${a.id}:point:${Number(a.x || 0).toFixed(4)}:${Number(a.y || 0).toFixed(4)}:${(a.note || "").trim()}`;
    })
    .join("|");
}

function annotationStateGetter(storeOrGet) {
  return typeof storeOrGet?.getState === "function"
    ? () => storeOrGet.getState()
    : typeof storeOrGet === "function"
      ? storeOrGet
      : () => storeOrGet;
}

/** Retain the original graph before live drag previews change annotation data. */
export function captureAnnotationHistory(storeOrGet) {
  const state = annotationStateGetter(storeOrGet)();
  return { nodes: [...state.nodes], edges: [...state.edges] };
}

/**
 * Commit annotations to store with undo/redo support.
 * Boundary call satisfying UNDO_ACTION_CONTRACTS["workflow.node.annotate"].
 */
export function commitNodeAnnotations(
  storeOrGet,
  nodeId,
  annotations,
  options = {},
) {
  const get = annotationStateGetter(storeOrGet);
  const state = get();
  const node = state?.nodes?.find((n) => n.id === nodeId);
  const beforeNode = options.beforeSnapshot
    ? options.beforeSnapshot.nodes.find((entry) => entry.id === nodeId)
    : node;
  // Enter also blurs the note input; unchanged notes must not add a second step.
  if (
    JSON.stringify(beforeNode?.data?.annotations ?? []) ===
    JSON.stringify(annotations)
  )
    return;
  const sourceImageId = node?.data?.imageId;
  const hash = computeAnnotationsHash(annotations);
  const derivedId =
    hash && sourceImageId ? `${sourceImageId}-annotated-${hash}` : null;
  const initialAnnotated = derivedId
    ? { id: derivedId, sourceImageId, annotationsHash: hash }
    : null;

  const applyChanges = () => {
    state.updateNodeData(nodeId, {
      annotations,
      annotatedImage: initialAnnotated,
    });
  };
  const beforeSnapshot =
    options.beforeSnapshot ?? captureAnnotationHistory(get);
  commitWorkflowGesture(
    get,
    beforeSnapshot,
    applyChanges,
    "workflow.node.annotate",
  );
  // Read the immutable store after the final write, including live drag previews.
  get().settleHistoryAfter("workflow.node.annotate");

  if (sourceImageId && annotations.length > 0 && options.sync !== false) {
    import("./annotated_image_sync.js")
      .then(({ syncAnnotatedImage }) => {
        if (typeof syncAnnotatedImage === "function") {
          syncAnnotatedImage({
            nodeId,
            sourceImageId,
            annotations,
            updateNodeData: state?.updateNodeData,
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }
}
