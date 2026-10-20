import PropTypes from "prop-types";
import { useEffect, useLayoutEffect, useState } from "react";
import { IconCheck, IconClose, IconCredits, IconExpand } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import { expandRectByHandle } from "../editor/outpaint_geometry.js";
import { defaultOutpaintRect } from "../editor/outpaint_direction.js";
import { MODEL_ROUTE_ID } from "../../shared/model-routes.js";
import { useEditorAiCredits } from "./editor_local_repaint_button.jsx";

/**
 * Outpaint frame: the user drags the selected layer's edges or corners
 * outward to mark the area the model should grow the picture into, then
 * confirms. There is deliberately no prompt box — the target area IS the
 * instruction, and asking for words on top of a gesture made the fastest
 * path through the feature the one nobody wanted to type into.
 *
 * Everything renders `fixed`, measured from the stage's client rect, because
 * the grown frame deliberately pokes past the page — and the stage clips its
 * children. Dragging is component-local state; nothing touches the document
 * until ✓ submits, so a cancelled gesture costs no history entry.
 */

const HANDLES = [
  { id: "nw", fx: 0, fy: 0, cursor: "cursor-nwse-resize" },
  { id: "top", fx: 0.5, fy: 0, cursor: "cursor-ns-resize" },
  { id: "ne", fx: 1, fy: 0, cursor: "cursor-nesw-resize" },
  { id: "left", fx: 0, fy: 0.5, cursor: "cursor-ew-resize" },
  { id: "right", fx: 1, fy: 0.5, cursor: "cursor-ew-resize" },
  { id: "sw", fx: 0, fy: 1, cursor: "cursor-nesw-resize" },
  { id: "bottom", fx: 0.5, fy: 1, cursor: "cursor-ns-resize" },
  { id: "se", fx: 1, fy: 1, cursor: "cursor-nwse-resize" },
];

function nodeRect(node) {
  return {
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 0,
    height: node.height ?? 0,
  };
}

/**
 * The rect the gesture starts on: the saliency planner's suggestion when it has
 * one, today's node frame otherwise. The suggestion is only a default — the
 * drag handler below keeps mutating `rect` from wherever this put it — and a
 * malformed plan must never stop the overlay from opening, so any throw falls
 * back to the frame.
 */
function initialRect(node, plan) {
  const base = nodeRect(node);
  if (!plan) return base;
  try {
    return defaultOutpaintRect(base, plan);
  } catch {
    return base;
  }
}

export default function EditorOutpaintOverlay({
  node,
  plan = null,
  viewport,
  stageRef,
  busy = false,
  onSubmit,
  onCancel,
  initialStageRect = null,
  creditsProps = null,
}) {
  const { t } = useI18n();
  const [rect, setRect] = useState(() => initialRect(node, plan));
  const [stageRect, setStageRect] = useState(
    () =>
      initialStageRect ??
      (typeof window === "undefined"
        ? { left: 0, top: 0, width: 1000, height: 800 }
        : null),
  );
  const {
    runsOnCredits,
    estimatedBadgeText,
    isInsufficient,
    openRecharge,
    checkBeforeRun,
  } = useEditorAiCredits(MODEL_ROUTE_ID.OUTPAINT, t, creditsProps || {});

  // Restart the gesture when another layer gets picked (or a new suggestion
  // arrives); the drag state below is never clobbered mid-gesture because the
  // plan prop is stable while the overlay is open.
  useEffect(() => {
    setRect(initialRect(node, plan));
  }, [node, plan]);

  // The stage box in client coordinates; fixed positioning needs it.
  useLayoutEffect(() => {
    const stage = stageRef?.current;
    if (!stage) return undefined;
    const measure = () => {
      const next = stage.getBoundingClientRect();
      setStageRect((current) =>
        current &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : {
              left: next.left,
              top: next.top,
              width: next.width,
              height: next.height,
            },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stageRef]);

  // Esc unwinds the gesture without touching the editor's own Escape stack.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  if (!stageRect) return null;

  const zoom = viewport.zoom || 1;
  const toClient = (r) => ({
    left: stageRect.left + r.x * zoom + viewport.panX,
    top: stageRect.top + r.y * zoom + viewport.panY,
    width: r.width * zoom,
    height: r.height * zoom,
  });
  const frame = toClient(rect);
  const origin = toClient(nodeRect(node));

  const startDrag = (handle) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let lastX = event.clientX;
    let lastY = event.clientY;

    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - lastX) / zoom;
      const dy = (moveEvent.clientY - lastY) / zoom;
      if (dx === 0 && dy === 0) return;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      setRect((current) => expandRectByHandle(current, handle, dx, dy));
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const base = nodeRect(node);
  const grown =
    rect.x !== base.x ||
    rect.y !== base.y ||
    rect.width !== base.width ||
    rect.height !== base.height;

  return (
    <>
      {/* The grown target frame: dashed purple; the original box stays solid. */}
      <div
        aria-hidden
        data-testid="outpaint-frame"
        className="pointer-events-none fixed z-40 border-2 border-dashed border-[#E5B2FF]/80 bg-[#E5B2FF]/10"
        style={{
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
        }}
      />
      <div
        aria-hidden
        data-testid="outpaint-origin"
        className="pointer-events-none fixed z-40 border border-white/70"
        style={{
          left: origin.left,
          top: origin.top,
          width: origin.width,
          height: origin.height,
        }}
      />
      {/* New size readout under the frame. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-40 -translate-x-1/2 rounded-full bg-black/75 px-2.5 py-0.5 text-[10px] font-mono tabular-nums text-white backdrop-blur"
        style={{
          left: frame.left + frame.width / 2,
          top: frame.top + frame.height + 6,
        }}
      >
        {Math.round(rect.width)} × {Math.round(rect.height)}
      </div>

      {HANDLES.map((handle) => (
        <button
          key={handle.id}
          type="button"
          data-testid={`outpaint-handle-${handle.id}`}
          aria-label={t("editor.outpaint.title")}
          onPointerDown={startDrag(handle.id)}
          className={`nodrag fixed z-50 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 bg-[#E5B2FF] transition-transform hover:scale-125 touch-none ${handle.cursor}`}
          style={{
            left: frame.left + frame.width * handle.fx,
            top: frame.top + frame.height * handle.fy,
          }}
        />
      ))}

      {/* Confirm bar: the drag is the whole instruction, so it is just ✓ / ✕. */}
      <div
        role="dialog"
        aria-label={t("editor.outpaint.title")}
        onMouseDown={(event) => event.stopPropagation()}
        className="nodrag fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/95 p-2.5 pl-3.5 shadow-menu backdrop-blur-2xl"
      >
        <IconExpand size={13} className="shrink-0 text-[#E5B2FF]" />
        <span className="whitespace-nowrap pr-1 text-[12px] text-neutral-300">
          {t("editor.outpaint.title")}
        </span>
        {runsOnCredits && estimatedBadgeText ? (
          <span
            data-testid="outpaint-credits-badge"
            className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-neutral-400 tabular-nums"
          >
            <IconCredits size={10} className="shrink-0 text-neutral-400" />
            {estimatedBadgeText}
          </span>
        ) : null}
        {isInsufficient ? (
          <button
            type="button"
            data-testid="outpaint-recharge-btn"
            onClick={openRecharge}
            className="flex items-center gap-1 rounded-lg bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-400 hover:bg-rose-500/20"
          >
            <span>{t("credits.payNow")}</span>
          </button>
        ) : null}
        <button
          type="button"
          data-testid="outpaint-apply"
          disabled={busy || !grown || isInsufficient}
          onClick={() => {
            if (!checkBeforeRun()) return;
            onSubmit(rect);
          }}
          aria-label={t("editor.outpaint.apply")}
          title={t("editor.outpaint.apply")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black transition-all hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <IconCheck size={14} />
        </button>
        <button
          type="button"
          data-testid="outpaint-cancel"
          onClick={onCancel}
          aria-label={t("editor.cancel")}
          title={t("editor.cancel")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-neutral-300 transition-all hover:bg-white/[0.12] hover:text-white"
        >
          <IconClose size={13} />
        </button>
      </div>
    </>
  );
}

EditorOutpaintOverlay.propTypes = {
  node: PropTypes.shape({
    id: PropTypes.string.isRequired,
    x: PropTypes.number,
    y: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
  }).isRequired,
  // The saliency planner's suggestion; null keeps today's node-frame default.
  plan: PropTypes.shape({
    preferredSides: PropTypes.arrayOf(PropTypes.string).isRequired,
    subjectBox: PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number,
      width: PropTypes.number,
      height: PropTypes.number,
    }),
    reason: PropTypes.string,
  }),
  viewport: PropTypes.shape({
    zoom: PropTypes.number,
    panX: PropTypes.number,
    panY: PropTypes.number,
  }).isRequired,
  stageRef: PropTypes.shape({ current: PropTypes.object }),
  busy: PropTypes.bool,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  initialStageRect: PropTypes.shape({
    left: PropTypes.number,
    top: PropTypes.number,
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  creditsProps: PropTypes.shape({
    runsOnCredits: PropTypes.bool,
    modelId: PropTypes.string,
    providerId: PropTypes.string,
    creditsBalance: PropTypes.number,
  }),
};
