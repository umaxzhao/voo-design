import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { getSetting, setSetting } from "../../shared/settings.js";
import {
  LAYERS_WIDTH_SETTING, LAYERS_WIDTH_DEFAULT, LAYERS_WIDTH_MIN,
  LAYERS_WIDTH_MAX, LAYERS_WIDTH_STEP, LAYERS_EDGE_GAP,
  clampLayersWidth, layersWidthFromPointer,
} from "./editor_layers_width.js";
import "./editor_layers_resize.css";

/** A single resize boundary shared by pointer and keyboard interactions. */
export default function EditorLayersResize({ panelRef, swapped, t }) {
  const preferredRef = useRef(clampLayersWidth(getSetting(LAYERS_WIDTH_SETTING)));
  const dragRef = useRef(null);
  const handleRef = useRef(null);
  const [size, setSize] = useState({ width: preferredRef.current, maximum: LAYERS_WIDTH_MAX, enabled: false });
  const sizeRef = useRef(size);
  const applyWidth = (value, maximum = sizeRef.current.maximum, enabled = sizeRef.current.enabled) => {
    const next = { width: clampLayersWidth(value, maximum), maximum, enabled };
    sizeRef.current = next;
    panelRef.current?.style.setProperty("--editor-layers-width", `${next.width}px`);
    setSize(next);
    return next.width;
  };
  const saveWidth = width => {
    preferredRef.current = width;
    setSetting(LAYERS_WIDTH_SETTING, width).catch(error => {
      console.error("Failed to persist layers panel width", error);
    });
  };
  const finish = commit => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (commit) saveWidth(sizeRef.current.width);
    else applyWidth(drag.startWidth);
    if (handleRef.current?.hasPointerCapture(drag.pointerId)) handleRef.current.releasePointerCapture(drag.pointerId);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const panel = panelRef.current;
    const parent = panel?.parentElement;
    if (!parent) return undefined;
    const measure = () => {
      const root = panel.closest('[data-testid="design-editor"]');
      const bounds = parent.getBoundingClientRect();
      const enabled = bounds.width >= 768 && !root?.classList.contains("editor-narrow") && window.innerWidth > 768;
      const otherBounds = Array.from(parent.querySelectorAll('[data-testid="editor-properties-panel"], [data-testid="editor-history-panel"]'))
        .map(element => element.getBoundingClientRect()).find(rect => rect.width > 0 && rect.height > 0);
      const panelBounds = panel.getBoundingClientRect();
      const clearWidth = otherBounds?.width && otherBounds.height
        ? (swapped ? panelBounds.right - otherBounds.right : otherBounds.left - panelBounds.left) - LAYERS_EDGE_GAP
        : bounds.width - LAYERS_EDGE_GAP * 2;
      const maximum = Math.max(LAYERS_WIDTH_MIN, Math.min(LAYERS_WIDTH_MAX, clearWidth));
      if (dragRef.current) finishRef.current(false);
      applyWidth(preferredRef.current, maximum, enabled);
    };
    const onKeyDown = event => {
      if (event.key !== "Escape" || !dragRef.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finishRef.current(false);
    };
    const onBlur = () => finishRef.current(false);
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    const classObserver = rootObserver(panel, measure);
    window.addEventListener("resize", measure);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown, true);
    measure();
    return () => {
      dragRef.current = null;
      observer.disconnect();
      classObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [panelRef, swapped]);

  // The canvas capture listener must yield before this control handles arrow keys.
  return <div
    ref={handleRef}
    role="separator"
    tabIndex={0}
    aria-label={t("editor.layers.resizeWidth")}
    aria-orientation="vertical"
    aria-valuemin={LAYERS_WIDTH_MIN}
    aria-valuemax={size.maximum}
    aria-valuenow={size.width}
    data-testid="editor-layers-resize"
    data-floating-surface
    data-side={swapped ? "left" : "right"}
    hidden={!size.enabled}
    className="editor-layers-resize"
    onPointerDown={event => {
      if (event.button !== 0 || !sizeRef.current.enabled) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: sizeRef.current.width };
    }}
    onPointerMove={event => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      applyWidth(layersWidthFromPointer(drag.startWidth, drag.startX, event.clientX, swapped, sizeRef.current.maximum));
    }}
    onPointerUp={event => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      event.stopPropagation();
      finish(true);
    }}
    onPointerCancel={() => finish(false)}
    onLostPointerCapture={() => finish(false)}
    onDoubleClick={event => {
      event.preventDefault();
      event.stopPropagation();
      saveWidth(applyWidth(LAYERS_WIDTH_DEFAULT));
    }}
    onKeyDown={event => {
      const direction = swapped ? -1 : 1;
      const width = sizeRef.current.width;
      const next = { ArrowLeft: width - LAYERS_WIDTH_STEP * direction, ArrowRight: width + LAYERS_WIDTH_STEP * direction,
        Home: LAYERS_WIDTH_MIN, End: sizeRef.current.maximum }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      saveWidth(applyWidth(next));
    }}
  />;
}

function rootObserver(panel, measure) {
  const root = panel.closest('[data-testid="design-editor"]');
  if (!root) return null;
  const observer = new MutationObserver(measure);
  observer.observe(root, { attributes: true, attributeFilter: ["class", "data-properties-open", "data-history-open"] });
  observer.observe(panel.parentElement, { childList: true });
  return observer;
}
EditorLayersResize.propTypes = { panelRef: PropTypes.object.isRequired, swapped: PropTypes.bool, t: PropTypes.func.isRequired };
