import PropTypes from "prop-types";
import { useEffect, useRef } from "react";
import { useI18n } from "../use_i18n.js";
import { effectivePage } from "../editor/scene_model.js";
import { docToScreenRect } from "../editor/scene_renderer.js";

export function resizeHandleRects(rect) {
  return {
    left: { left: rect.x, top: rect.y, height: rect.height },
    right: { left: rect.x + rect.width, top: rect.y, height: rect.height },
    top: { left: rect.x, top: rect.y, width: rect.width },
    bottom: { left: rect.x, top: rect.y + rect.height, width: rect.width },
  };
}

/**
 * Edge handles that resize the document by dragging.
 *
 * The handles are positioned from `docRect` — the page's screen rectangle —
 * so they track the viewport through zoom and pan. Figma semantics: contents
 * keep their offset from the top-left origin; when the left or top edge
 * drags, the engine shifts the viewport so the opposite edge stays pinned on
 * screen. Deltas are applied incrementally (last pointer position → now), and
 * the whole drag commits one history entry on release.
 */
export default function EditorResizeHandles({
  engine = null,
  docRect = null,
  onCommit,
  onDragStart = null,
  hidden = false,
}) {
  const { t } = useI18n();
  const handleRefs = useRef(new Map());

  useEffect(() => {
    if (hidden || !docRect || !engine) return undefined;
    const sync = () => {
      const doc = engine.getDocument?.();
      const viewport = engine.getViewport?.();
      const rect = doc && viewport ? docToScreenRect(effectivePage(doc), viewport) : docRect;
      // Camera-only frames skip React; grips must follow the live page anyway.
      for (const [edge, style] of Object.entries(resizeHandleRects(rect))) {
        const element = handleRefs.current.get(edge);
        if (!element) continue;
        for (const [property, value] of Object.entries(style)) element.style[property] = `${value}px`;
      }
    };
    sync();
    return engine.subscribeRender?.(sync);
  }, [engine, hidden, docRect]);

  if (hidden || !docRect || !engine) return null;
  const handleRects = resizeHandleRects(docRect);

  const startDrag = (edges) => (event) => {
    event.preventDefault();
    event.stopPropagation();

    // onDragStart may return a per-move callback that receives how much the
    // page actually grew, so the caller can keep the opposite edge still
    // (the free canvas positions pages itself).
    const onMove = onDragStart?.(edges);

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let lastX = event.clientX;
    let lastY = event.clientY;

    const handleMove = (moveEvent) => {
      const zoom = engine.getZoom() || 1;
      const deltaX = (moveEvent.clientX - lastX) / zoom;
      const deltaY = (moveEvent.clientY - lastY) / zoom;
      if (deltaX === 0 && deltaY === 0) return;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      const fromCentre = moveEvent.altKey;
      const before = engine.getDocument?.();
      engine.resizeDocumentEdges(edges, deltaX, deltaY, {
        commit: false,
        fromCentre,
      });
      const after = engine.getDocument?.();
      // The size, not the pointer delta, is what changed: it stops at the
      // minimum page size.
      if (onMove && before && after) {
        onMove(
          edges,
          after.width - before.width,
          after.height - before.height,
          fromCentre,
        );
      }
    };

    const onUp = () => {
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      onCommit();
    };

    target.addEventListener("pointermove", handleMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const handles = [
    {
      key: "left",
      edges: { left: true },
      style: handleRects.left,
      className: "w-4 -translate-x-1/2 cursor-ew-resize",
      pill: true,
    },
    {
      key: "right",
      edges: { right: true },
      style: handleRects.right,
      className: "w-4 -translate-x-1/2 cursor-ew-resize",
      pill: true,
    },
    {
      key: "top",
      edges: { top: true },
      style: handleRects.top,
      className: "h-3 -translate-y-1/2 cursor-ns-resize",
      lineClass: "left-0 right-0 top-1/2 h-0.5 -translate-y-1/2",
    },
    {
      key: "bottom",
      edges: { bottom: true },
      style: handleRects.bottom,
      className: "h-3 -translate-y-1/2 cursor-ns-resize",
      lineClass: "left-0 right-0 top-1/2 h-0.5 -translate-y-1/2",
    },
  ];

  return (
    <>
      {handles.map((handle) => (
        <div
          key={handle.key}
          ref={(element) => {
            if (element) handleRefs.current.set(handle.key, element);
            else handleRefs.current.delete(handle.key);
          }}
          data-editor-resize-edge={handle.key}
          role="separator"
          aria-label={t("editor.resizeCanvas")}
          title={t("editor.resizeCanvas")}
          onPointerDown={startDrag(handle.edges)}
          style={handle.style}
          className={`group/resize absolute z-10 touch-none ${handle.className}`}
        >
          {handle.pill ? (
            // Flat clean grip pill on the vertical edges
            <span className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 transition-all group-hover/resize:h-12 group-hover/resize:bg-[#b2ffd6]" />
          ) : (
            <span
              className={`absolute bg-[#b2ffd6] opacity-0 transition-opacity group-hover/resize:opacity-100 ${handle.lineClass}`}
            />
          )}
        </div>
      ))}
    </>
  );
}

EditorResizeHandles.propTypes = {
  engine: PropTypes.object,
  docRect: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  onCommit: PropTypes.func.isRequired,
  onDragStart: PropTypes.func,
  hidden: PropTypes.bool,
};
