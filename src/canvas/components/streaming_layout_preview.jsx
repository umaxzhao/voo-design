import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
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
  const [ready, setReady] = useState(false);
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const cursorRef = useRef(null);
  const scratchRef = useRef(null);
  const latestRef = useRef({ previewHtml, width, height });
  latestRef.current = { previewHtml, width, height };

  useEffect(() => {
    let painted = null;
    let disposed = false;
    let imageRevision = 0;
    const images = new Map();
    const revealed = new Map();
    let revealingUntil = 0;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const bitmapOf = (node) => {
      if (!node.src) return null;
      let entry = images.get(node.src);
      if (!entry) {
        const image = new Image();
        entry = { image, loadedAt: null };
        images.set(node.src, entry);
        image.onload = () => {
          if (disposed) return;
          entry.loadedAt = performance.now();
          imageRevision += 1;
        };
        image.src = node.src;
      }
      return entry.loadedAt === null ? null : entry.image;
    };
    let signatures = [];
    const paint = () => {
      const { previewHtml, width, height } = latestRef.current;
      if (
        !previewHtml ||
        (painted?.html === previewHtml &&
          painted.width === width &&
          painted.height === height &&
          painted.revision === imageRevision &&
          !painted.animating)
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
        // Preserve paint order (parents/backgrounds must precede their children).
        // The tolerant parser exposes each complete streamed element immediately.
        for (const node of doc.nodes) {
          if (node.kind !== "image") continue;
          bitmapOf(node);
          const entry = images.get(node.src);
          if (entry?.loadedAt != null) {
            node.opacity = (node.opacity ?? 1) * (reducedMotion
              ? 1 : Math.min(1, (performance.now() - entry.loadedAt) / 300));
          } else {
            node.kind = "rect";
            node.fill = "#e8e9ed";
          }
        }
        const now = performance.now();
        const newcomers = doc.nodes
          .map((node, index) => ({ node, key: `${index}:${node.kind}:${node.x}:${node.y}` }))
          .filter(({ key }) => !revealed.has(key)).sort((a, b) => a.node.y - b.node.y);
        newcomers.forEach(({ key }, index) => {
          const start = now + (reducedMotion ? 0 : Math.min(index * 35, 350));
          revealed.set(key, start);
          revealingUntil = Math.max(revealingUntil, start + (reducedMotion ? 0 : 180));
        });
        doc.nodes.forEach((node, index) => {
          const start = revealed.get(`${index}:${node.kind}:${node.x}:${node.y}`) ?? now;
          node.opacity = (node.opacity ?? 1) * (reducedMotion
            ? 1 : Math.max(0, Math.min(1, (now - start) / 180)));
        });
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
          pageBackground: true,
          bypassAdjustments: true,
          bitmapOf,
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
        if (doc.nodes.some((node) => node.kind !== "group" && (node.opacity ?? 1) > 0)) {
          setReady(true);
        }
        painted = {
          html: previewHtml, width, height, revision: imageRevision,
          animating: !reducedMotion && (now < revealingUntil || [...images.values()].some(
            (entry) => entry.loadedAt !== null && now - entry.loadedAt < 300,
          )),
        };
      } catch {
        // Partial tags and styles are expected while the model is writing.
        // Keep the last good frame; final parsing reports persistent errors.
      }
    };
    paint();
    const interval = setInterval(paint, PREVIEW_INTERVAL_MS);
    return () => {
      disposed = true;
      clearInterval(interval);
      for (const { image } of images.values()) {
        image.onload = null;
        image.onerror = null;
        image.src = "";
      }
      images.clear();
    };
  }, []);

  return (
    <div
      ref={canvasWrapRef}
      data-testid="streaming-layout-frame-preview"
      className="relative h-full w-full overflow-hidden bg-neutral-100"
    >
      {!ready && <div data-testid="streaming-layout-skeleton" role="status" aria-label={t("agent.panel.busy")}
        className="absolute inset-0 space-y-6 p-[8%] motion-safe:animate-pulse">
        <div className="h-3 w-1/4 rounded-md bg-neutral-200" />
        <div className="h-8 w-3/4 rounded-md bg-neutral-200" />
        <div className="h-3 w-1/2 rounded-md bg-neutral-200" />
        <div className="h-48 rounded-xl bg-neutral-200/70" />
        <div className="h-3 w-2/3 rounded-md bg-neutral-200" />
      </div>}
      <canvas
        ref={canvasRef}
        data-testid="streaming-layout-preview"
        role="img"
        aria-label={t("node.layout.preview")}
        className={`h-full w-full object-contain ${ready ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={cursorRef}
        data-testid="streaming-agent-cursor"
        aria-hidden="true"
        className="pointer-events-none absolute z-10 opacity-0 transition-[left,top,opacity] duration-300 ease-out motion-reduce:transition-none"
      >
        <IconCursor size={18} strokeWidth={1.5} className="text-neutral-300" />
        <span className="ml-4 mt-1 block w-max rounded-lg bg-neutral-900 px-2 py-1 text-[10px] text-neutral-300">
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
