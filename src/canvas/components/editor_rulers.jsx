/**
 * Canvas rulers, draggable guides, and the view-aid toggles that sit beside
 * the zoom cluster.
 *
 * Geometry lives in `editor/rulers_geometry.js` (pure, unit-tested). This file
 * owns only the DOM: two 20px strips, the corner box, the guide lines and the
 * pointer gestures that create/move/remove them.
 *
 * Pointer contract:
 *  - the overlay root is `pointer-events-none`, so the canvas keeps every
 *    event except on the strips and on a guide's small hit band;
 *  - dragging out of the top ruler creates a horizontal guide, out of the left
 *    ruler a vertical one;
 *  - dragging a guide moves it; dropping it back on a ruler removes it;
 *  - Escape cancels the gesture, Delete removes the selected guide (routed by
 *    the editor shortcut hook so it does not also delete the selected layer).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Eye, EyeOff, Ruler, Trash2 } from "lucide-react";
import {
  GUIDE_HIT_SLOP,
  GUIDE_TYPES,
  RULER_SIZE,
  docToScreen,
  generateRulerTicks,
  isOverRulerStrip,
  roundedGuidePos,
  screenToDoc,
} from "../editor/rulers_geometry.js";

/** A drag has to leave this many pixels before it counts as a drag. */
const DRAG_SLOP_PX = 3;

/** i18n lookup with an English fallback while the Lead wires the dictionary. */
function label(t, key, fallback) {
  const value = typeof t === "function" ? t(key) : key;
  return value && value !== key ? value : fallback;
}

function clampSize(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export default function EditorRulers({
  showRulers = true,
  showGuides = true,
  guides = [],
  selectedGuideId = null,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
  onSelectGuide = null,
  onCreateGuide = null,
  onMoveGuide = null,
  onRemoveGuide = null,
  t = null,
}) {
  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // The ruler overlay is stretched over the canvas; ticks depend on its pixel
  // size, so it must observe resizes instead of caching the first measure.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;
    const measure = () =>
      setSize({
        width: clampSize(element.clientWidth),
        height: clampSize(element.clientHeight),
      });
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cameraX = useMemo(
    () => ({ zoom: zoom || 1, pan: Number(offsetX) || 0 }),
    [zoom, offsetX],
  );
  const cameraY = useMemo(
    () => ({ zoom: zoom || 1, pan: Number(offsetY) || 0 }),
    [zoom, offsetY],
  );

  const horizontalTicks = useMemo(
    () =>
      generateRulerTicks({
        length: size.width,
        zoom: cameraX.zoom,
        pan: cameraX.pan,
      }),
    [size.width, cameraX],
  );
  const verticalTicks = useMemo(
    () =>
      generateRulerTicks({
        length: size.height,
        zoom: cameraY.zoom,
        pan: cameraY.pan,
      }),
    [size.height, cameraY],
  );

  const pointOf = useCallback((event) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
    };
  }, []);

  const cameraFor = useCallback(
    (type) => (type === GUIDE_TYPES.VERTICAL ? cameraX : cameraY),
    [cameraX, cameraY],
  );

  /** Top ruler → horizontal guide (positioned by y); left ruler → vertical. */
  const beginCreate = useCallback(
    (type) => (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const point = pointOf(event);
      const axis = type === GUIDE_TYPES.VERTICAL ? point.x : point.y;
      const pos = roundedGuidePos(
        screenToDoc(axis, cameraFor(type)),
      );
      dragRef.current = {
        kind: "create",
        type,
        pointerId: event.pointerId,
        startAxis: axis,
        moved: false,
        pos,
      };
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic pointers cannot capture; the handlers still receive moves.
      }
      onSelectGuide?.(null);
      setDraft({ kind: "create", type, pos });
    },
    [cameraFor, onSelectGuide, pointOf],
  );

  const handleCreateMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.kind !== "create" || drag.pointerId !== event.pointerId)
        return;
      const point = pointOf(event);
      const axis =
        drag.type === GUIDE_TYPES.VERTICAL ? point.x : point.y;
      if (!drag.moved && Math.abs(axis - drag.startAxis) < DRAG_SLOP_PX) return;
      drag.moved = true;
      drag.pos = roundedGuidePos(screenToDoc(axis, cameraFor(drag.type)));
      setDraft({ kind: "create", type: drag.type, pos: drag.pos });
      event.preventDefault();
    },
    [cameraFor, pointOf],
  );

  const endCreate = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.kind !== "create" || drag.pointerId !== event.pointerId)
        return;
      dragRef.current = null;
      setDraft(null);
      if (drag.moved) onCreateGuide?.({ type: drag.type, pos: drag.pos });
    },
    [onCreateGuide],
  );

  const beginMove = useCallback(
    (guide) => (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const point = pointOf(event);
      const axis =
        guide.type === GUIDE_TYPES.VERTICAL ? point.x : point.y;
      dragRef.current = {
        kind: "move",
        id: guide.id,
        type: guide.type,
        pointerId: event.pointerId,
        startAxis: axis,
        moved: false,
        originalPos: guide.pos,
        pos: guide.pos,
      };
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic pointers cannot capture; the handlers still receive moves.
      }
      onSelectGuide?.(guide.id);
      // The parent snapshots the document here so the whole drag is one entry.
      onMoveGuide?.(guide.id, guide.pos, "begin");
      setDraft({ kind: "move", id: guide.id, type: guide.type, pos: guide.pos });
    },
    [onMoveGuide, onSelectGuide, pointOf],
  );

  const handleGuideMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.kind !== "move" || drag.pointerId !== event.pointerId)
        return;
      const point = pointOf(event);
      const axis =
        drag.type === GUIDE_TYPES.VERTICAL ? point.x : point.y;
      if (!drag.moved && Math.abs(axis - drag.startAxis) < DRAG_SLOP_PX) return;
      drag.moved = true;
      drag.pos = roundedGuidePos(screenToDoc(axis, cameraFor(drag.type)));
      setDraft({ kind: "move", id: drag.id, type: drag.type, pos: drag.pos });
      onMoveGuide?.(drag.id, drag.pos, "preview");
      event.preventDefault();
    },
    [cameraFor, onMoveGuide, pointOf],
  );

  const endGuide = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.kind !== "move" || drag.pointerId !== event.pointerId)
        return;
      dragRef.current = null;
      setDraft(null);
      if (!drag.moved) {
        onMoveGuide?.(drag.id, drag.originalPos, "cancel");
        return;
      }
      const point = pointOf(event);
      if (isOverRulerStrip(point, { showRulers })) {
        // Dropping a guide back on a ruler is the remove gesture; restoring the
        // preview first keeps the removal as the only committed edit.
        onMoveGuide?.(drag.id, drag.originalPos, "cancel");
        onRemoveGuide?.(drag.id);
        onSelectGuide?.(null);
        return;
      }
      onMoveGuide?.(drag.id, drag.pos, "commit");
    },
    [onMoveGuide, onRemoveGuide, onSelectGuide, pointOf, showRulers],
  );

  // Escape cancels the in-flight guide gesture before the editor-wide shortcut
  // handler unwinds tools/selection. The listener is registered once at mount:
  // this child's effects run before the parent shortcut hook's effect, so it is
  // the earlier capture listener and `stopImmediatePropagation` wins. A
  // listener added only while dragging would be registered too late.
  const escapeHandlerRef = useRef({ onMoveGuide });
  escapeHandlerRef.current = { onMoveGuide };
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dragRef.current = null;
      setDraft(null);
      if (drag.kind === "move") {
        escapeHandlerRef.current.onMoveGuide?.(
          drag.id,
          drag.originalPos,
          "cancel",
        );
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const guideStyles = (guide) => {
    const vertical = guide.type === GUIDE_TYPES.VERTICAL;
    const at = docToScreen(guide.pos, cameraFor(guide.type));
    const lead = showRulers ? RULER_SIZE : 0;
    return vertical
      ? { left: at - GUIDE_HIT_SLOP, top: lead, bottom: 0, width: GUIDE_HIT_SLOP * 2 }
      : { top: at - GUIDE_HIT_SLOP, left: lead, right: 0, height: GUIDE_HIT_SLOP * 2 };
  };

  const renderGuide = (guide) => {
    const vertical = guide.type === GUIDE_TYPES.VERTICAL;
    // The live drag is drawn from `draft` at its new position; the guide itself
    // stays mounted (this element owns the pointer capture) but its line is
    // hidden so it does not ghost at the old spot. The document is only
    // written on release.
    const dragging = draft?.kind === "move" && draft.id === guide.id;
    const selected = guide.id === selectedGuideId;
    const at = docToScreen(guide.pos, cameraFor(guide.type));
    if (!Number.isFinite(at)) return null;
    return (
      <div
        key={guide.id}
        role="separator"
        data-testid="editor-guide"
        data-guide-id={guide.id}
        aria-orientation={vertical ? "vertical" : "horizontal"}
        aria-label={`${label(t, "editor.guides.label", "Guide")} ${Math.round(guide.pos)}`}
        className="group pointer-events-auto absolute cursor-col-resize outline-none"
        style={guideStyles(guide)}
        onPointerDown={beginMove(guide)}
        onPointerMove={handleGuideMove}
        onPointerUp={endGuide}
        onPointerCancel={endGuide}
      >
        <span
          aria-hidden
          className={`absolute ${
            vertical
              ? "left-1/2 top-0 h-full w-px -translate-x-1/2"
              : "left-0 top-1/2 h-px w-full -translate-y-1/2"
          } ${
            dragging
              ? "opacity-0"
              : selected
                ? "bg-[#a7ffd4]"
                : "bg-[#a7ffd4]/45 group-hover:bg-[#a7ffd4]"
          }`}
        />
      </div>
    );
  };

  const draftGuide = draft ? { id: "__draft__", type: draft.type, pos: draft.pos } : null;
  const draftAt = draftGuide
    ? docToScreen(draftGuide.pos, cameraFor(draftGuide.type))
    : null;

  return (
    <div
      ref={rootRef}
      data-testid="editor-rulers"
      className="pointer-events-none absolute inset-0 z-20 select-none font-mono"
    >
      {showRulers ? (
        <>
          {/* Horizontal ruler: drag downward to add a horizontal guide. */}
          <div
            data-testid="editor-ruler-top"
            role="group"
            aria-label={label(t, "editor.rulers.horizontal", "Horizontal ruler")}
            className="pointer-events-auto absolute left-0 right-0 top-0 overflow-hidden border-b border-white/10 bg-[#1c1c1c]/95"
            style={{ height: RULER_SIZE }}
            onPointerDown={beginCreate(GUIDE_TYPES.HORIZONTAL)}
            onPointerMove={handleCreateMove}
            onPointerUp={endCreate}
            onPointerCancel={endCreate}
          >
            {horizontalTicks.ticks.map((tick) => (
              <span
                key={`h-${tick.pos}`}
                aria-hidden
                className="absolute bottom-0 w-px bg-white/25"
                style={{ left: tick.at, height: tick.major ? 7 : 3 }}
              />
            ))}
            {horizontalTicks.ticks
              .filter((tick) => tick.major)
              .map((tick) => (
                <span
                  key={`hl-${tick.pos}`}
                  aria-hidden
                  className="absolute top-[2px] whitespace-nowrap text-[9px] leading-none tabular-nums text-neutral-400"
                  style={{ left: tick.at + 3 }}
                >
                  {tick.label}
                </span>
              ))}
          </div>

          {/* Vertical ruler: drag rightward to add a vertical guide. */}
          <div
            data-testid="editor-ruler-left"
            role="group"
            aria-label={label(t, "editor.rulers.vertical", "Vertical ruler")}
            className="pointer-events-auto absolute bottom-0 left-0 top-0 overflow-hidden border-r border-white/10 bg-[#1c1c1c]/95"
            style={{ width: RULER_SIZE }}
            onPointerDown={beginCreate(GUIDE_TYPES.VERTICAL)}
            onPointerMove={handleCreateMove}
            onPointerUp={endCreate}
            onPointerCancel={endCreate}
          >
            {verticalTicks.ticks.map((tick) => (
              <span
                key={`v-${tick.pos}`}
                aria-hidden
                className="absolute right-0 h-px bg-white/25"
                style={{ top: tick.at, width: tick.major ? 7 : 3 }}
              />
            ))}
            {verticalTicks.ticks
              .filter((tick) => tick.major)
              .map((tick) => (
                <span
                  key={`vl-${tick.pos}`}
                  aria-hidden
                  className="absolute whitespace-nowrap text-[9px] leading-none tabular-nums text-neutral-400"
                  style={{
                    left: 2,
                    top: tick.at + 3,
                    transform: "rotate(90deg)",
                    transformOrigin: "left top",
                  }}
                >
                  {tick.label}
                </span>
              ))}
          </div>

          {/* Corner box: a quiet origin marker, not a control. */}
          <div
            aria-hidden
            className="pointer-events-auto absolute left-0 top-0 border-b border-r border-white/10 bg-[#1c1c1c]"
            style={{ width: RULER_SIZE, height: RULER_SIZE }}
          >
            <span className="absolute left-1 top-1 h-1 w-1 rounded-full bg-[#a7ffd4]/70" />
          </div>
        </>
      ) : null}

      {showGuides ? guides.map(renderGuide) : null}

      {draftGuide && Number.isFinite(draftAt) ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute bg-[#a7ffd4]"
            style={
              draftGuide.type === GUIDE_TYPES.VERTICAL
                ? {
                    left: draftAt,
                    top: showRulers ? RULER_SIZE : 0,
                    bottom: 0,
                    width: 1,
                  }
                : {
                    top: draftAt,
                    left: showRulers ? RULER_SIZE : 0,
                    right: 0,
                    height: 1,
                  }
            }
          />
          <span
            aria-hidden
            className="pointer-events-none absolute rounded-md bg-[#a7ffd4] px-1 py-0.5 text-[9px] leading-none tabular-nums text-black"
            style={
              draftGuide.type === GUIDE_TYPES.VERTICAL
                ? { left: draftAt + 4, top: (showRulers ? RULER_SIZE : 0) + 4 }
                : { left: (showRulers ? RULER_SIZE : 0) + 4, top: draftAt + 4 }
            }
          >
            {Math.round(draftGuide.pos)}
          </span>
        </>
      ) : null}
    </div>
  );
}

EditorRulers.propTypes = {
  showRulers: PropTypes.bool,
  showGuides: PropTypes.bool,
  guides: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      type: PropTypes.oneOf(["v", "h"]).isRequired,
      pos: PropTypes.number.isRequired,
    }),
  ),
  selectedGuideId: PropTypes.string,
  zoom: PropTypes.number,
  offsetX: PropTypes.number,
  offsetY: PropTypes.number,
  onSelectGuide: PropTypes.func,
  onCreateGuide: PropTypes.func,
  onMoveGuide: PropTypes.func,
  onRemoveGuide: PropTypes.func,
  t: PropTypes.func,
};

/**
 * Canvas view-aid toggles. Rendered as a group INSIDE the single bottom
 * toolbar (EditorZoom) — never as a second floating bar.
 *
 * Rulers/guides are persisted settings, so the buttons are
 * tri-state readouts of the same values the pointer handlers read.
 */
export function EditorCanvasAids({
  showRulers = true,
  showGuides = true,
  canClearGuides = false,
  onToggleRulers = null,
  onToggleGuides = null,
  onClearGuides = null,
  t = null,
}) {
  const buttonClass = (active) =>
    `flex h-7 w-7 items-center justify-center rounded-lg outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
      active ? "text-black" : "text-black/35"
    }`;
  return (
    <div
      data-testid="editor-canvas-aids"
      role="group"
      aria-label={label(t, "editor.guides.show", "Canvas aids")}
      className="flex items-center gap-0.5"
    >
      <button
        type="button"
        data-testid="editor-toggle-rulers"
        onClick={onToggleRulers}
        title={label(
          t,
          showRulers ? "editor.rulers.hide" : "editor.rulers.show",
          showRulers ? "Hide rulers" : "Show rulers",
        )}
        aria-label={label(t, "editor.rulers.toggle", "Show/hide rulers")}
        aria-pressed={Boolean(showRulers)}
        className={buttonClass(showRulers)}
      >
        <Ruler size={13} />
      </button>
      <button
        type="button"
        data-testid="editor-toggle-guides"
        onClick={onToggleGuides}
        title={label(
          t,
          showGuides ? "editor.guides.hide" : "editor.guides.show",
          showGuides ? "Hide guides" : "Show guides",
        )}
        aria-label={label(t, "editor.guides.toggle", "Show/hide guides")}
        aria-pressed={Boolean(showGuides)}
        className={buttonClass(showGuides)}
      >
        {showGuides ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button
        type="button"
        data-testid="editor-clear-guides"
        onClick={onClearGuides}
        disabled={!canClearGuides}
        title={label(t, "editor.guides.clearAll", "Clear all guides")}
        aria-label={label(t, "editor.guides.clearAll", "Clear all guides")}
        className={`${buttonClass(false)} disabled:opacity-25 disabled:hover:opacity-25`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

EditorCanvasAids.propTypes = {
  showRulers: PropTypes.bool,
  showGuides: PropTypes.bool,
  canClearGuides: PropTypes.bool,
  onToggleRulers: PropTypes.func,
  onToggleGuides: PropTypes.func,
  onClearGuides: PropTypes.func,
  t: PropTypes.func,
};
