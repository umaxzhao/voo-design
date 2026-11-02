/**
 * Command definitions part 3 (pure schema, zone split).
 */
export const COMMAND_DEFINITIONS_PART3 = {
  set_tool: {
    id: "set_tool",
    kind: "action",
    summary: "Select active editor tool and submode",
    description:
      "Switch the design editor's active interactive tool and submode on the UI (e.g. select, marquee, brush, pen, shapes). Use this when guiding user interaction or switching editor modes. Note: Direct action tools (such as draw_rect, apply_copy_structure, select_region) insert elements directly and do not require calling set_tool beforehand.",
    params: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description:
            "Tool identifier (e.g. select, marquee, brush, healing, pen, rect, ellipse, line, polygon, star, arrow, text, region, crop, eraser, dropper, fill, gradient, distort, perspective, puppet_warp).",
        },
        submode: {
          type: "string",
          description:
            "Optional tool submode (e.g. marquee: rect/ellipse/poly/magnetic/lasso/wand/region; brush: normal/smudge/blur/sharpen/dodge/burn/sponge; healing: aiRepair/spot/patch/clone; pen: pen/curvature_pen/free_pen; shapes: rect/ellipse/line/polygon/star/arrow).",
        },
      },
      required: ["tool"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID", "CAPABILITY_MISSING"],
    mutates: false,
    undoable: false,
    historyLabel: null,
    approvalLevel: "read-only",
    requires: { args: ["tool"] },
  },
  draw_rect: {
    id: "draw_rect",
    kind: "action",
    summary: "Draw a rectangle shape",
    description:
      "Create and insert a rectangle shape layer with specified position, dimensions, fill, stroke, strokeWidth, and cornerRadius.",
    params: {
      type: "object",
      properties: {
        x: { type: "number", description: "Left edge in document pixels." },
        y: { type: "number", description: "Top edge in document pixels." },
        width: {
          type: "number",
          description: "Rectangle width in document pixels (> 0).",
        },
        height: {
          type: "number",
          description: "Rectangle height in document pixels (> 0).",
        },
        fill: {
          type: "string",
          description: "Fill colour (hex/rgba) or 'transparent'.",
        },
        stroke: { type: "string", description: "Stroke colour (hex/rgba)." },
        strokeWidth: {
          type: "number",
          description: "Stroke width in document pixels.",
        },
        cornerRadius: {
          type: "number",
          description: "Corner radius in document pixels (>= 0).",
        },
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { args: ["x", "y", "width", "height"] },
  },
  draw_ellipse: {
    id: "draw_ellipse",
    kind: "action",
    summary: "Draw an ellipse shape",
    description:
      "Create and insert an ellipse shape layer with specified position, dimensions, fill, stroke, and strokeWidth.",
    params: {
      type: "object",
      properties: {
        x: { type: "number", description: "Left edge in document pixels." },
        y: { type: "number", description: "Top edge in document pixels." },
        width: {
          type: "number",
          description: "Ellipse width in document pixels (> 0).",
        },
        height: {
          type: "number",
          description: "Ellipse height in document pixels (> 0).",
        },
        fill: {
          type: "string",
          description: "Fill colour (hex/rgba) or 'transparent'.",
        },
        stroke: { type: "string", description: "Stroke colour (hex/rgba)." },
        strokeWidth: {
          type: "number",
          description: "Stroke width in document pixels.",
        },
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { args: ["x", "y", "width", "height"] },
  },
  draw_line: {
    id: "draw_line",
    kind: "action",
    summary: "Draw a straight line segment",
    description:
      "Create and insert a two-point straight line segment path on the canvas from (x1, y1) to (x2, y2).",
    params: {
      type: "object",
      properties: {
        x1: { type: "number", description: "Start X in document pixels." },
        y1: { type: "number", description: "Start Y in document pixels." },
        x2: { type: "number", description: "End X in document pixels." },
        y2: { type: "number", description: "End Y in document pixels." },
        stroke: { type: "string", description: "Stroke colour (hex/rgba)." },
        strokeWidth: {
          type: "number",
          description: "Stroke width in document pixels.",
        },
      },
      required: ["x1", "y1", "x2", "y2"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { args: ["x1", "y1", "x2", "y2"] },
  },
  draw_arrow: {
    id: "draw_arrow",
    kind: "action",
    summary: "Draw an arrow vector path",
    description:
      "Create and insert a directional arrow path on the canvas from (x1, y1) to (x2, y2) with configurable stroke, strokeWidth, and arrowSize.",
    params: {
      type: "object",
      properties: {
        x1: { type: "number", description: "Start X in document pixels." },
        y1: { type: "number", description: "Start Y in document pixels." },
        x2: { type: "number", description: "End X in document pixels." },
        y2: { type: "number", description: "End Y in document pixels." },
        stroke: { type: "string", description: "Stroke colour (hex/rgba)." },
        strokeWidth: {
          type: "number",
          description: "Stroke width in document pixels.",
        },
        arrowSize: {
          type: "number",
          description: "Arrowhead size in document pixels.",
        },
        arrowStart: {
          type: "boolean",
          description: "Whether to draw an arrowhead at start point too.",
        },
      },
      required: ["x1", "y1", "x2", "y2"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { args: ["x1", "y1", "x2", "y2"] },
  },
  draw_polygon: {
    id: "draw_polygon",
    kind: "action",
    summary: "Draw a closed polygon shape",
    description:
      "Create and insert a closed polygon shape layer from an array of vertices or regular polygon parameters (cx, cy, radius, sides).",
    params: {
      type: "object",
      properties: {
        points: {
          type: "array",
          description:
            "Array of vertex objects [{ x, y }, ...], minimum 3 vertices.",
          items: {
            type: "object",
            properties: {
              x: { type: "number", description: "Vertex X coordinate." },
              y: { type: "number", description: "Vertex Y coordinate." },
            },
            required: ["x", "y"],
            additionalProperties: false,
          },
        },
        cx: {
          type: "number",
          description: "Center X for regular polygon (used if points omitted).",
        },
        cy: {
          type: "number",
          description: "Center Y for regular polygon (used if points omitted).",
        },
        radius: {
          type: "number",
          description: "Radius for regular polygon (> 0).",
        },
        sides: {
          type: "number",
          description: "Number of sides for regular polygon (>= 3, default 3).",
        },
        fill: {
          type: "string",
          description: "Fill colour (hex/rgba) or 'transparent'.",
        },
        stroke: { type: "string", description: "Stroke colour (hex/rgba)." },
        strokeWidth: {
          type: "number",
          description: "Stroke width in document pixels.",
        },
      },
      required: [],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: {},
  },
  draw_star: {
    id: "draw_star",
    kind: "action",
    summary: "Draw a star vector shape",
    description:
      "Create and insert a star vector shape centered at (cx, cy) with outerRadius, innerRadius, point count, fill, and stroke.",
    params: {
      type: "object",
      properties: {
        cx: { type: "number", description: "Center X in document pixels." },
        cy: { type: "number", description: "Center Y in document pixels." },
        outerRadius: {
          type: "number",
          description: "Outer radius in document pixels (> 0).",
        },
        innerRadius: {
          type: "number",
          description: "Inner radius in document pixels (> 0).",
        },
        points: {
          type: "number",
          description: "Number of star points (>= 3, default 5).",
        },
        fill: {
          type: "string",
          description: "Fill colour (hex/rgba) or 'transparent'.",
        },
        stroke: { type: "string", description: "Stroke colour (hex/rgba)." },
        strokeWidth: {
          type: "number",
          description: "Stroke width in document pixels.",
        },
      },
      required: ["cx", "cy", "outerRadius"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID"],
    mutates: true,
    undoable: true,
    historyLabel: "editor.history.entry.action",
    approvalLevel: "canvas-mutation",
    requires: { args: ["cx", "cy", "outerRadius"] },
  },
  select_ellipse_region: {
    id: "select_ellipse_region",
    kind: "action",
    summary: "Create an elliptical pixel selection",
    description:
      "Create or combine an elliptical pixel selection inside the open image editor using document-space bounds.",
    params: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Image node to select on (omit to use selected one).",
        },
        x: { type: "number", description: "Left edge in document pixels." },
        y: { type: "number", description: "Top edge in document pixels." },
        width: {
          type: "number",
          description: "Ellipse bounding width (> 0).",
        },
        height: {
          type: "number",
          description: "Ellipse bounding height (> 0).",
        },
        mode: {
          type: "string",
          enum: ["replace", "add", "subtract", "intersect"],
          description:
            "How to combine with existing selection (default replace).",
        },
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID", "NODE_NOT_FOUND"],
    mutates: true,
    undoable: false,
    historyLabel: null,
    approvalLevel: "canvas-mutation",
    requires: { args: ["x", "y", "width", "height"] },
  },
  select_lasso_region: {
    id: "select_lasso_region",
    kind: "action",
    summary: "Create a polygonal or magnetic lasso pixel selection",
    description:
      "Create or combine a lasso pixel selection inside the open image editor from an array of document-space vertices. With method 'polygon' (default) the vertices are connected as straight polygonal lasso segments. With method 'magnetic' the vertices are treated as magnetic-lasso anchors: the live-wire solver snaps each segment to the strongest nearby image edge, and the selection is closed from the last anchor back to the first using the same Magnetic Lasso controller and history contract the interactive tool uses.",
    params: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Image node to select on (omit to use selected one).",
        },
        method: {
          type: "string",
          enum: ["polygon", "magnetic"],
          description:
            "Lasso style: 'polygon' for straight-line segments (default), or 'magnetic' to snap each anchor-to-anchor segment to image edges.",
        },
        points: {
          type: "array",
          description:
            "Array of anchor/vertex objects [{ x, y }, ...], minimum 3 points. For magnetic lasso these are anchors along the boundary, not including the first anchor again; the command closes back to the first anchor automatically.",
          items: {
            type: "object",
            properties: {
              x: { type: "number", description: "Vertex X coordinate." },
              y: { type: "number", description: "Vertex Y coordinate." },
            },
            required: ["x", "y"],
            additionalProperties: false,
          },
        },
        mode: {
          type: "string",
          enum: ["replace", "add", "subtract", "intersect"],
          description:
            "How to combine with existing selection (default replace).",
        },
      },
      required: ["points"],
      additionalProperties: false,
    },
    errors: ["ARGS_INVALID", "CAPABILITY_MISSING", "NODE_NOT_FOUND"],
    mutates: true,
    undoable: false,
    historyLabel: null,
    approvalLevel: "canvas-mutation",
    requires: { args: ["points"] },
  },
  clear_pixel_selection: {
    id: "clear_pixel_selection",
    kind: "action",
    summary: "Deselect active pixel selection",
    description:
      "Clear the active pixel selection (marching ants) from the editor (Select > Deselect / ⌘D / Ctrl+D).",
    params: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    errors: [],
    mutates: true,
    undoable: false,
    historyLabel: null,
    approvalLevel: "read-only",
    requires: {},
  },
};
