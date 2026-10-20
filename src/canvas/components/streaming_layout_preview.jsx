import PropTypes from "prop-types";
import { useEffect, useRef } from "react";
import { incrementalHtmlToDocument } from "../editor/html_import.js";
import { draw } from "../editor/scene_renderer.js";
import {
  streamingCursorScreenPoint,
  streamingCursorTarget,
} from "../editor/streaming_cursor_target.js";
import { IconCursor } from "../icons.jsx";

const PREVIEW_MAX_EDGE = 2048;
const PREVIEW_INTERVAL_MS = 100;

/** Render the partial layout with the same scene painter used by final layers. */
export default function StreamingLayoutPreview({
  previewHtml,
  width,
  height,
  t,
}) {
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const cursorRef = useRef(null);
  const scratchRef = useRef(null);
  const latestRef = useRef({ previewHtml, width, height });
  latestRef.current = { previewHtml, width, height };

  useEffect(() => {
    let painted = null;
    let signatures = [];
    const paint = () => {
      const { previewHtml, width, height } = latestRef.current;
      if (
        !previewHtml ||
        (painted?.html === previewHtml &&
          painted.width === width &&
          painted.height === height)
      )
        return;
      const visible = canvasRef.current;
      if (!visible) return;
      const scratch = scratchRef.current ?? document.createElement("canvas");
      scratchRef.current = scratch;
      try {
        const { doc } = incrementalHtmlToDocument(previewHtml, {
          width,
          height,
        });
        if (!doc.nodes?.length) return;
        const scale = Math.min(
          1,
          PREVIEW_MAX_EDGE / Math.max(doc.width, doc.height),
        );
        scratch.width = Math.max(1, Math.round(doc.width * scale));
        scratch.height = Math.max(1, Math.round(doc.height * scale));
        const scratchContext = scratch.getContext("2d");
        if (!scratchContext) return;
        draw(scratchContext, {
          doc,
          viewport: { panX: 0, panY: 0, zoom: scale },
          dpr: 1,
          selectionRect: null,
          cropRect: null,
          includeRegions: false,
          pageBackground: false,
          bypassAdjustments: true,
          bitmapOf: () => null,
          maskOf: () => null,
        });
        visible.width = scratch.width;
        visible.height = scratch.height;
        visible.getContext("2d")?.drawImage(scratch, 0, 0);
        const next = streamingCursorTarget(doc, signatures);
        signatures = next.signatures;
        const wrapper = canvasWrapRef.current;
        const cursor = cursorRef.current;
        if (next.target && wrapper && cursor) {
          const point = streamingCursorScreenPoint({
            target: next.target,
            doc,
            canvas: visible.getBoundingClientRect(),
            wrapper: wrapper.getBoundingClientRect(),
          });
          cursor.style.left = `${point.x}px`;
          cursor.style.top = `${point.y}px`;
          cursor.style.opacity = "1";
        }
        painted = { html: previewHtml, width, height };
      } catch {
        // Partial tags and styles are expected while the model is writing.
        // Keep the last good frame; final parsing reports persistent errors.
      }
    };
    paint();
    const interval = setInterval(paint, PREVIEW_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      ref={canvasWrapRef}
      data-testid="streaming-layout-frame-preview"
      className="relative h-full w-full overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        data-testid="streaming-layout-preview"
        role="img"
        aria-label={t("node.layout.preview")}
        className="h-full w-full object-contain"
      />
      <div
        ref={cursorRef}
        data-testid="streaming-agent-cursor"
        aria-hidden="true"
        className="pointer-events-none absolute z-10 opacity-0 transition-[left,top,opacity] duration-300 ease-out motion-reduce:transition-none"
      >
        <IconCursor size={18} strokeWidth={1.5} className="text-[#E5B2FF]" />
        <span className="ml-4 mt-1 block w-max rounded-lg bg-neutral-900 px-2 py-1 text-[10px] text-[#eed0ff]">
          {t("agent.title")}
        </span>
      </div>
    </div>
  );
}

StreamingLayoutPreview.propTypes = {
  previewHtml: PropTypes.string.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  t: PropTypes.func.isRequired,
};
