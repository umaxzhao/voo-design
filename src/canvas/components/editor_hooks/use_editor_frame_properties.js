import { useCallback, useMemo } from "react";
import { frameEditorFills } from "../../editor/frame-fills.js";
import { setDocumentSize as resizePageDocument } from "../../editor/doc_ops_canvas.js";

/** Keep document geometry and its panel representation on the same resize path. */
export function useEditorFrameProperties({
  engine, doc, focusedId, isFrameSelected, frameLayout, layoutById,
  setEditorArtboardLayout, multi,
}) {
  const frameObject = useMemo(() => {
    if (!doc || !isFrameSelected) return null;
    return {
      id: focusedId,
      name: doc.title || "Frame",
      kind: "rect",
      isFrame: true,
      x: frameLayout.x ?? 0,
      y: frameLayout.y ?? 0,
      width: doc.width ?? 1024,
      height: doc.height ?? 1024,
      lockRatio: doc.lockRatio ?? false,
      rotation: doc.rotation ?? 0,
      flipX: doc.flipX ?? false,
      flipY: doc.flipY ?? false,
      opacity: doc.opacity ?? 1,
      blendMode: doc.blendMode ?? "normal",
      fill: doc.backgroundColor || "#ffffff",
      fills: frameEditorFills(doc),
      fillOpacity: doc.fillOpacity ?? 1,
      fillHidden: doc.fillHidden ?? false,
      stroke: doc.stroke ?? null,
      strokes: Array.isArray(doc.strokes) ? doc.strokes : [],
      strokeHidden: doc.strokeHidden ?? false,
      strokeOpacity: doc.strokeOpacity ?? 1,
      strokeWidth: doc.strokeWidth ?? 1,
      strokeAlign: doc.strokeAlign ?? "inside",
      strokeSides: doc.strokeSides,
      strokeCap: doc.strokeCap,
      strokeJoin: doc.strokeJoin,
      strokeDash: doc.strokeDash,
      strokeMiterLimit: doc.strokeMiterLimit,
      cornerRadius: doc.cornerRadius ?? 0,
      cornerRadii: doc.cornerRadii ?? null,
      effects: doc.effects ?? [],
      clipContent: doc.clipContent ?? true,
      autoLayout: doc.autoLayout ?? null,
      layoutGrid: doc.layoutGrid ?? null,
      visible: true,
      locked: false,
    };
  }, [doc, focusedId, isFrameSelected, frameLayout.x, frameLayout.y]);

  /**
   * Page/frame resize through the engine's document path.
   *
   * The document operation resolves page and child geometry together; one
   * update preserves preview options and creates one undo entry on commit.
   */
  const applyPageResize = useCallback(
    (nextW, nextH, options = {}) => {
      const current = engine?.getDocument?.();
      if (!current) return;
      // Document operations resolve constraints for every resize entry point.
      // Do not reflow here again: that would apply the same delta twice.
      const next = resizePageDocument(current, nextW, nextH);
      // Same doc path as setDocumentSize: text measurement, auto-layout
      // reflow, render, history and persistence all stay in sync.
      engine.updateDocument(
        { width: next.width, height: next.height, nodes: next.nodes },
        options,
      );
      if (!multi) engine?.zoomToFit?.();
    },
    [engine, multi],
  );

  const handleMutateFrame = useCallback(
    (patch, options = {}) => {
      if (!focusedId || !doc) return;

      if (patch.x !== undefined || patch.y !== undefined) {
        const layout = layoutById.get(focusedId);
        if (layout) {
          setEditorArtboardLayout(focusedId, {
            ...layout,
            ...(patch.x !== undefined ? { x: patch.x } : {}),
            ...(patch.y !== undefined ? { y: patch.y } : {}),
          });
        }
      }

      if (patch.width !== undefined || patch.height !== undefined) {
        const nextW = patch.width ?? doc.width;
        const nextH = patch.height ?? doc.height;
        applyPageResize(nextW, nextH, options);
        const resized = engine?.getDocument?.();
        const layout = layoutById.get(focusedId);
        if (layout) {
          setEditorArtboardLayout(focusedId, {
            ...layout,
            // Preserve the chosen anchor when size and position change together.
            ...(patch.x !== undefined ? { x: patch.x } : {}),
            ...(patch.y !== undefined ? { y: patch.y } : {}),
            width: resized?.width ?? nextW,
            height: resized?.height ?? nextH,
          });
        }
      }

      const docPatch = {};
      for (const [key, val] of Object.entries(patch)) {
        if (key === "x" || key === "y" || key === "width" || key === "height") continue;
        if (key === "fill") {
          docPatch.backgroundColor = val;
        } else {
          docPatch[key] = val;
        }
      }

      if (patch.fills !== undefined && patch.fill === undefined) {
        docPatch.backgroundColor = patch.fills?.[0]?.fill ?? patch.fills?.[0]?.color ?? "transparent";
      }
      if (Object.keys(docPatch).length > 0) {
        if (typeof engine?.updateDocument === "function") {
          engine.updateDocument(docPatch, options);
        } else if (typeof engine?.setDoc === "function") {
          engine.setDoc({ ...engine.getDocument(), ...docPatch });
        }
      }
    },
    [
      focusedId,
      doc,
      layoutById,
      engine,
      setEditorArtboardLayout,
      applyPageResize,
    ],
  );

  return { frameObject, applyPageResize, handleMutateFrame };
}
