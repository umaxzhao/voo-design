/** Agent tools: text and path editing. */

const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  NODE_NOT_FOUND: "agentNodeNotFound",
  INVALID_ARGS: "agentInvalidArgs",
});

function invalidArgs(message = TOOL_ERROR.INVALID_ARGS) {
  const full = message === TOOL_ERROR.INVALID_ARGS ? message : `${TOOL_ERROR.INVALID_ARGS}: ${message}`;
  throw Object.assign(new Error(full), {
    code: TOOL_ERROR.INVALID_ARGS,
  });
}

function nodeNotFound() {
  throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), {
    code: TOOL_ERROR.NODE_NOT_FOUND,
  });
}

function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) {
    throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), {
      code: TOOL_ERROR.NO_EDITOR,
    });
  }
  return editor;
}

function requireId(value) {
  if (typeof value !== "string" || value.trim() === "") invalidArgs(`Invalid argument "layerId": expected a non-empty string, got ${JSON.stringify(value)}`);
  return value;
}

function getDocument(editor) {
  const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
  if (!doc || !Array.isArray(doc.nodes)) invalidArgs();
  return doc;
}

function getNode(editor, layerId) {
  return (
    editor.getNode?.(layerId) ??
    getDocument(editor).nodes.find((node) => node.id === layerId) ??
    null
  );
}

function requireNode(editor, layerId) {
  const node = getNode(editor, layerId);
  if (!node) nodeNotFound();
  return node;
}

function commitDocument(editor, next, message) {
  if (typeof editor.setDoc === "function") {
    editor.setDoc(next, { name: message });
    return true;
  }
  if (typeof editor.updateDocument === "function") {
    editor.updateDocument(next, { name: message });
    return true;
  }
  if (typeof editor.setDocument === "function") {
    editor.setDocument(next, { name: message });
    return true;
  }
  if (typeof editor.applyDocument === "function") {
    editor.applyDocument(next, { name: message });
    return true;
  }
  const current = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
  if (current && typeof current === "object") {
    for (const [key, value] of Object.entries(next)) current[key] = value;
    if (typeof editor.commitEditorDocument === "function") {
      editor.commitEditorDocument({ message });
    }
    editor.requestRender?.();
    return true;
  }
  invalidArgs();
}

function cloneAnchor(anchor) {
  if (!anchor || typeof anchor !== "object") return anchor;
  const clone = { ...anchor };
  if (Array.isArray(clone.in)) clone.in = clone.in.slice();
  if (Array.isArray(clone.out)) clone.out = clone.out.slice();
  return clone;
}

function cloneStyle(style) {
  if (style === null || typeof style !== "object") return style;
  try {
    return JSON.parse(JSON.stringify(style));
  } catch {
    return { ...style };
  }
}

function stylesEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}

function getNodeText(node) {
  if (typeof node?.text === "string") return node.text;
  if (typeof node?.textContent === "string") return node.textContent;
  if (typeof node?.content === "string") return node.content;
  return "";
}

function applyTextRangeStyleToNode(node, start, end, style) {
  const text = getNodeText(node);
  const length = text.length;
  if (!Number.isFinite(start) || !Number.isFinite(end)) invalidArgs(`Invalid argument "start"/"end": expected finite numbers`);
  if (!Number.isInteger(start) || !Number.isInteger(end)) invalidArgs(`Invalid argument "start"/"end": expected integers`);
  if (start < 0 || end > length || start >= end) invalidArgs(`Invalid argument "start"/"end": expected 0 <= start < end <= ${length}`);
  const nextStyle = cloneStyle(style);

  const existing = Array.isArray(node.textRuns) ? node.textRuns : [];
  const runs = existing
    .filter(
      (run) =>
        run &&
        typeof run === "object" &&
        Number.isFinite(run.start) &&
        Number.isFinite(run.end) &&
        run.end > run.start,
    )
    .map((run) => ({
      start: Math.max(0, Math.min(length, Number(run.start))),
      end: Math.max(0, Math.min(length, Number(run.end))),
      style: cloneStyle(run.style),
    }))
    .filter((run) => run.end > run.start);

  if (runs.length === 0 && length > 0) {
    const baseStyle = cloneStyle(node.textStyle ?? node.style ?? {});
    runs.push({ start: 0, end: length, style: baseStyle });
  }

  const boundaries = new Set([0, length, start, end]);
  for (const run of runs) {
    boundaries.add(run.start);
    boundaries.add(run.end);
  }
  const sorted = [...boundaries]
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const nextRuns = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    if (segEnd <= segStart) continue;
    let segStyle;
    if (segStart >= start && segEnd <= end) {
      segStyle = nextStyle;
    } else {
      const mid = (segStart + segEnd) / 2;
      const covering = runs.find(
        (run) => mid >= run.start && mid < run.end,
      );
      segStyle = covering ? cloneStyle(covering.style) : cloneStyle({});
    }
    nextRuns.push({ start: segStart, end: segEnd, style: segStyle });
  }

  const merged = [];
  for (const run of nextRuns) {
    if (
      merged.length > 0 &&
      stylesEqual(merged[merged.length - 1].style, run.style)
    ) {
      merged[merged.length - 1].end = run.end;
    } else {
      merged.push({ start: run.start, end: run.end, style: cloneStyle(run.style) });
    }
  }

  return merged.filter((run) => run.end > run.start);
}

function normalizeAnchorFromOp(op) {
  if (op?.point && typeof op.point === "object") {
    return cloneAnchor(op.point);
  }
  const anchor = {
    x: Number.isFinite(Number(op?.x)) ? Number(op.x) : 0,
    y: Number.isFinite(Number(op?.y)) ? Number(op.y) : 0,
  };
  if (op?.in !== undefined) {
    anchor.in = Array.isArray(op.in) ? op.in.slice() : op.in;
  }
  if (op?.out !== undefined) {
    anchor.out = Array.isArray(op.out) ? op.out.slice() : op.out;
  }
  if (op?.close !== undefined) anchor.close = Boolean(op.close);
  if (op?.type !== undefined) anchor.type = op.type;
  return cloneAnchor(anchor);
}

function setTextRangeStyle(args = {}) {
  const editor = requireEditor();
  const layerId = requireId(args.layerId);
  const node = requireNode(editor, layerId);
  const style = args.style;
  if (style === null || typeof style !== "object" || Array.isArray(style)) {
    invalidArgs(`Invalid argument "style": expected a plain object, got ${JSON.stringify(style)}`);
  }
  const start = Number(args.start);
  const end = Number(args.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) invalidArgs(`Invalid argument "start"/"end": expected finite numbers, got start=${JSON.stringify(args.start)}, end=${JSON.stringify(args.end)}`);

  const doc = getDocument(editor);
  const textRuns = applyTextRangeStyleToNode(node, start, end, style);

  const nextNode = { ...node, textRuns };
  const nextDoc = {
    ...doc,
    nodes: doc.nodes.map((item) =>
      item.id === layerId ? nextNode : item,
    ),
  };
  commitDocument(editor, nextDoc, "AI: Set text range style");
  return { ok: true, layerId, start, end, style: cloneStyle(style), textRuns };
}

function getPathNodes(args = {}) {
  const editor = requireEditor();
  const layerId = requireId(args.layerId);
  const doc = getDocument(editor);
  const node = requireNode(editor, layerId);
  const points = Array.isArray(node.points) ? node.points : [];
  return { ok: true, layerId, points };
}

function editPathNodes(args = {}) {
  const editor = requireEditor();
  const layerId = requireId(args.layerId);
  const ops = args.ops;
  if (!Array.isArray(ops)) invalidArgs(`Invalid argument "ops": expected an array, got ${JSON.stringify(ops)}`);
  const doc = getDocument(editor);
  const node = requireNode(editor, layerId);
  const points = Array.isArray(node.points)
    ? node.points.map((point) => cloneAnchor(point))
    : [];

  for (const op of ops) {
    if (!op || typeof op !== "object") invalidArgs(`Invalid argument "ops[]": expected an object, got ${JSON.stringify(op)}`);
    const kind = op.op;
    switch (kind) {
      case "move": {
        const index = Number(op.index);
        if (!Number.isInteger(index) || index < 0 || index >= points.length) {
          invalidArgs(`Invalid argument "index": expected integer in [0, ${points.length}), got ${JSON.stringify(op.index)}`);
        }
        const point = points[index];
        if (op.point && typeof op.point === "object") {
          const next = normalizeAnchorFromOp(op);
          if (Number.isFinite(next.x)) point.x = next.x;
          if (Number.isFinite(next.y)) point.y = next.y;
        } else {
          if (Number.isFinite(Number(op.x))) point.x = Number(op.x);
          if (Number.isFinite(Number(op.y))) point.y = Number(op.y);
          if (Number.isFinite(Number(op.dx))) point.x += Number(op.dx);
          if (Number.isFinite(Number(op.dy))) point.y += Number(op.dy);
        }
        break;
      }
      case "insert":
      case "add": {
        let index = op.index;
        if (index === undefined) index = points.length;
        index = Number(index);
        if (!Number.isInteger(index) || index < 0 || index > points.length) {
          invalidArgs(`Invalid argument "index": expected integer in [0, ${points.length}], got ${JSON.stringify(op.index)}`);
        }
        const anchor = normalizeAnchorFromOp(op);
        points.splice(index, 0, anchor);
        break;
      }
      case "delete":
      case "remove": {
        if (Array.isArray(op.indices)) {
          const indices = op.indices
            .map((value) => Number(value))
            .sort((a, b) => b - a);
          for (const index of indices) {
            if (!Number.isInteger(index) || index < 0 || index >= points.length) {
              invalidArgs(`Invalid argument "indices": expected integers in [0, ${points.length}), got ${JSON.stringify(index)}`);
            }
            points.splice(index, 1);
          }
        } else {
          const index = Number(op.index);
          if (!Number.isInteger(index) || index < 0 || index >= points.length) {
            invalidArgs(`Invalid argument "index": expected integer in [0, ${points.length}), got ${JSON.stringify(op.index)}`);
          }
          points.splice(index, 1);
        }
        break;
      }
      case "setHandles": {
        const index = Number(op.index);
        if (!Number.isInteger(index) || index < 0 || index >= points.length) {
          invalidArgs(`Invalid argument "index": expected integer in [0, ${points.length}), got ${JSON.stringify(op.index)}`);
        }
        const point = points[index];
        if (op.handles && typeof op.handles === "object") {
          if (op.handles.in !== undefined) {
            point.in = Array.isArray(op.handles.in)
              ? op.handles.in.slice()
              : op.handles.in;
          }
          if (op.handles.out !== undefined) {
            point.out = Array.isArray(op.handles.out)
              ? op.handles.out.slice()
              : op.handles.out;
          }
        }
        if (op.in !== undefined) {
          point.in = Array.isArray(op.in) ? op.in.slice() : op.in;
        }
        if (op.out !== undefined) {
          point.out = Array.isArray(op.out) ? op.out.slice() : op.out;
        }
        break;
      }
      case "setType": {
        const index = Number(op.index);
        if (!Number.isInteger(index) || index < 0 || index >= points.length) {
          invalidArgs(`Invalid argument "index": expected integer in [0, ${points.length}), got ${JSON.stringify(op.index)}`);
        }
        const point = points[index];
        if (op.type !== undefined) point.type = op.type;
        if (op.close !== undefined) point.close = Boolean(op.close);
        if (op.value !== undefined) point.value = op.value;
        break;
      }
      default:
        invalidArgs(`Invalid argument "op": expected one of move, insert, add, delete, remove, setHandles, setType, got ${JSON.stringify(op.op)}`);
    }
  }

  const nextNode = { ...node, points };
  const nextDoc = {
    ...doc,
    nodes: getDocument(editor).nodes.map((item) =>
      item.id === layerId ? nextNode : item,
    ),
  };
  commitDocument(editor, nextDoc, "AI: Edit path nodes");
  return { ok: true, layerId, points: points.map((point) => cloneAnchor(point)) };
}

export const TEXT_PATH_TOOL_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "set_text_range_style",
      description:
        "Apply a style to a character range of a text layer, splitting and merging text runs.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          start: { type: "number" },
          end: { type: "number" },
          style: { type: "object" },
        },
        required: ["layerId", "start", "end", "style"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_path_nodes",
      description: "Read a path layer's anchors and handles.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
        },
        required: ["layerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_path_nodes",
      description: "Edit a path layer's anchors and handles with a list of operations.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          ops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: {
                  type: "string",
                  enum: ["move", "insert", "delete", "setHandles", "setType"],
                },
                index: { type: "number" },
                indices: { type: "array", items: { type: "number" } },
                x: { type: "number" },
                y: { type: "number" },
                dx: { type: "number" },
                dy: { type: "number" },
                point: { type: "object" },
                in: {},
                out: {},
                handles: { type: "object" },
                type: {},
                close: { type: "boolean" },
              },
              required: ["op"],
            },
          },
        },
        required: ["layerId", "ops"],
      },
    },
  },
]);

export const TEXT_PATH_TOOL_EXECUTORS = Object.freeze({
  set_text_range_style: setTextRangeStyle,
  get_path_nodes: getPathNodes,
  edit_path_nodes: editPathNodes,
});
