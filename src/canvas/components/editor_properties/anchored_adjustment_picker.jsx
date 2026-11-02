import PropTypes from "prop-types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../use_i18n.js";

const VIEWPORT_INSET = 12;
const ANCHOR_GAP = 12;

/** Keep the picker outside transformed/scrolling editor containers and within the viewport. */
export default function AnchoredAdjustmentPicker({
  children,
  side,
  onClose,
  showPresets,
}) {
  const { t } = useI18n();
  const markerRef = useRef(null);
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    const anchor = markerRef.current?.parentElement;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left;
    let top;
    if (side === "top") {
      left = rect.left + (rect.width - width) / 2;
      top = rect.top - height - ANCHOR_GAP;
      if (top < VIEWPORT_INSET) top = rect.bottom + ANCHOR_GAP;
    } else {
      left =
        side === "right"
          ? rect.left - width - ANCHOR_GAP
          : rect.right + ANCHOR_GAP;
      if (left < VIEWPORT_INSET) left = rect.right + ANCHOR_GAP;
      if (left + width > viewportWidth - VIEWPORT_INSET)
        left = rect.left - width - ANCHOR_GAP;
      top = rect.top + (rect.height - height) / 2;
    }
    setPosition({
      left: Math.max(
        VIEWPORT_INSET,
        Math.min(left, viewportWidth - width - VIEWPORT_INSET),
      ),
      top: Math.max(
        VIEWPORT_INSET,
        Math.min(top, viewportHeight - height - VIEWPORT_INSET),
      ),
    });
  }, [side, showPresets]);

  useEffect(() => {
    if (position)
      panelRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [position]);

  useEffect(() => {
    const closeOnViewportChange = (event) => {
      if (!panelRef.current?.contains(event.target)) onClose();
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("resize", onClose);
    document.addEventListener("scroll", closeOnViewportChange, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("resize", onClose);
      document.removeEventListener("scroll", closeOnViewportChange, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [onClose]);

  return (
    <>
      <span ref={markerRef} className="hidden" aria-hidden="true" />
      {createPortal(
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label={t("editor.popover.close")}
            onClick={onClose}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("editor.layers.addAdjustment")}
            data-editor-adjustment-picker="true"
            data-testid="editor-adjustment-picker"
            className={`fixed z-50 flex max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] flex-col gap-3 rounded-3xl bg-neutral-900 p-4 shadow-panel font-mono text-neutral-200 border border-white/10 ${showPresets ? "w-[30rem]" : "w-[21rem]"}`}
            style={{
              left: position?.left ?? VIEWPORT_INSET,
              top: position?.top ?? VIEWPORT_INSET,
              visibility: position ? "visible" : "hidden",
            }}
          >
            {children}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

AnchoredAdjustmentPicker.propTypes = {
  children: PropTypes.node.isRequired,
  side: PropTypes.oneOf(["left", "right", "top"]).isRequired,
  onClose: PropTypes.func.isRequired,
  showPresets: PropTypes.bool.isRequired,
};
