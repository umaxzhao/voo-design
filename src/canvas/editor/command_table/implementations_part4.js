import { editorCommandError } from "./errors.js";
import { resolveTracePoints, sampleBezierPath } from "./helpers.js";

/**
 * Command implementations part 4 (zone split).
 */
export const IMPLEMENTATIONS_PART4 = {
  async select_ellipse_region({ engine }, args) {
    const { nodeId, x, y, width, height, mode = "replace" } = args;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw editorCommandError(
        "ARGS_INVALID",
        "select_ellipse_region needs a positive width and height.",
        { args: ["width", "height"] },
      );
    }
    const { ellipseContour } = await import("../pixel_selection.js");
    const contours = ellipseContour({ x, y, width, height });
    if (!contours.length) {
      throw editorCommandError(
        "ARGS_INVALID",
        "The ellipse region produced no contour.",
      );
    }
    const host = nodeId ?? engine?.getSelectedId?.() ?? null;
    if (!host) {
      throw editorCommandError(
        "NODE_NOT_FOUND",
        "No image node to select on — pass nodeId or select an image first.",
        { nodes: ["image"] },
      );
    }
    const bounds = { x, y, width, height };
    engine?.combinePixelSelection?.(
      null,
      { nodeId: host, contours, bounds },
      mode,
    );
    return { nodeId: host, bounds };
  },

  async select_lasso_region({ engine }, args) {
    const { nodeId, points, mode = "replace", method = "polygon" } = args;
    if (!Array.isArray(points) || points.length < 3) {
      throw editorCommandError(
        "ARGS_INVALID",
        "select_lasso_region requires a points array with at least 3 vertices.",
        { args: ["points"] },
      );
    }
    const host = nodeId ?? engine?.getSelectedId?.() ?? null;
    if (!host) {
      throw editorCommandError(
        "NODE_NOT_FOUND",
        "No image node to select on — pass nodeId or select an image first.",
        { nodes: ["image"] },
      );
    }

    if (method === "magnetic") {
      if (
        typeof engine?.clickMagneticLasso !== "function" ||
        typeof engine?.finishMagneticLasso !== "function"
      ) {
        throw editorCommandError(
          "CAPABILITY_MISSING",
          "This image editor build does not expose the Magnetic Lasso controller to commands.",
          { canvas: ["image editor"] },
        );
      }
      const started = engine.clickMagneticLasso?.(host, points[0], mode);
      if (!started) {
        throw editorCommandError(
          "ARGS_INVALID",
          "Magnetic Lasso could not start on the target image — check that the point is on an editable image node.",
          { args: ["points[0]"] },
        );
      }
      // Each click after start moves the live-wire edge to that anchor and
      // records it. The final selection is closed by finishMagneticLasso,
      // which is the same controller + history path the interactive tool uses.
      for (let index = 1; index < points.length; index += 1) {
        engine.clickMagneticLasso?.(host, points[index], mode);
      }
      const finished = engine.finishMagneticLasso?.();
      if (!finished) {
        engine.cancelMagneticLasso?.();
        throw editorCommandError(
          "ARGS_INVALID",
          "Magnetic Lasso could not close the anchors into a valid selection — add more anchors or move them closer to a strong edge.",
          { args: ["points"] },
        );
      }
      const selection = engine.getPixelSelection?.();
      return {
        nodeId: host,
        method: "magnetic",
        bounds: selection?.bounds ?? null,
        contourPoints: selection?.contours?.[0]?.length ?? 0,
      };
    }

    const ring = points.map((p) => [p.x, p.y]);
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    if (width <= 0 || height <= 0) {
      throw editorCommandError(
        "ARGS_INVALID",
        "The lasso points enclose zero area.",
      );
    }
    const bounds = { x: minX, y: minY, width, height };
    const contours = [ring];
    engine?.combinePixelSelection?.(
      null,
      { nodeId: host, contours, bounds },
      mode,
    );
    return { nodeId: host, method: "polygon", bounds };
  },

  async brush_stroke({ engine }, args) {
    const path = args?.path;
    const trace = args?.trace;
    const tracePoints = trace ? resolveTracePoints(engine, trace) : null;
    const points = tracePoints ?? sampleBezierPath(path);
    if (points.length === 0) {
      throw editorCommandError(
        "ARGS_INVALID",
        "brush_stroke needs a cubic Bézier path or a semantic trace.",
        { path: ["start", "segments"], trace: ["kind"] },
      );
    }
    const brush = args?.brush ?? {};
    const nodeId =
      args?.nodeId ??
      engine?.getSelectedId?.() ??
      engine?.getDocument?.()?.nodes?.find((n) => n.kind === "image")?.id ??
      null;
    const armed = engine?.beginPaintStroke?.(nodeId, {
      mode: "paint",
      size: brush.size ?? engine?.getBrushWidth?.() ?? 24,
      hardness: brush.hardness ?? engine?.getBrushHardness?.() ?? 1,
      color: brush.color ?? engine?.getColor?.() ?? "#ff0000",
      opacity: brush.opacity ?? engine?.getBrushOpacity?.() ?? 1,
    });
    if (!armed) {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "Could not arm a brush stroke on the current target.",
        { canvas: ["image layer"] },
      );
    }
    for (const point of points) {
      engine.paintStrokeTo?.(point, 0.5);
    }
    await engine?.finishPaintStroke?.();
    return { ok: true, painted: points.length };
  },

  async clone_stroke({ engine }, args) {
    const points = sampleBezierPath(args?.path);
    if (points.length === 0 || !args?.sourcePoint) {
      throw editorCommandError(
        "ARGS_INVALID",
        "clone_stroke needs a source point and a non-empty cubic Bézier path.",
        { path: ["start", "segments"], sourcePoint: ["x", "y"] },
      );
    }
    const nodeId =
      args?.nodeId ??
      engine?.getSelectedId?.() ??
      engine?.getDocument?.()?.nodes?.find((n) => n.kind === "image")?.id ??
      null;

    // Confirm applies the preview that the generic dispatcher already computed.
    const applied = await engine?.applyBitmapPreview?.();
    if (!applied) {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "No pending clone stamp preview to apply.",
        { preview: ["bitmap"] },
      );
    }
    return { ok: true, applied: true, nodeId };
  },

  clear_pixel_selection({ engine }) {
    engine?.clearPixelSelection?.();
    return { ok: true };
  },
};
