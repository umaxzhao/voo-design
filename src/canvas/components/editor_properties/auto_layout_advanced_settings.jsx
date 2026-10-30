import PropTypes from "prop-types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";
import { useI18n } from "../../use_i18n.js";
const useViewportLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The inspector scrolls; advanced fields must float outside its clipping box. */
export default function AutoLayoutAdvancedSettings({ children }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const label = t("editor.autoLayout.advanced");

  useViewportLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const below = anchor.bottom + 6;
    setPosition({
      left: Math.max(8, Math.min(anchor.right - panel.width, window.innerWidth - panel.width - 8)),
      top: Math.max(8, Math.min(below + panel.height <= window.innerHeight - 8 ? below : anchor.top - panel.height - 6,
        window.innerHeight - panel.height - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (open && position) panelRef.current?.querySelector("button, input")?.focus();
  }, [open, position]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const outside = (event) => {
      // CustomSelect portals its options, which still belong to this popover.
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target) ||
        event.target.closest?.('[role="listbox"]')) return;
      close();
    };
    const escape = (event) => {
      if (event.key !== "Escape" || event.target?.matches?.("input")) return;
      const nested = [...document.querySelectorAll('[role="listbox"]:not([data-layers-list])')]
        .some((menu) => menu.getClientRects().length > 0);
      if (nested) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.06]"
    >
      <SlidersHorizontal size={14} />
    </button>
    {open ? createPortal(
      <div
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        aria-label={label}
        data-testid="editor-auto-layout-advanced"
        className="fixed z-[140] max-h-[calc(100dvh-16px)] w-56 max-w-[calc(100vw-16px)] space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-3 shadow-panel"
        style={{ left: position?.left ?? 8, top: position?.top ?? 8, visibility: position ? "visible" : "hidden" }}
      >
        {children}
      </div>, document.body,
    ) : null}
  </>;
}

AutoLayoutAdvancedSettings.propTypes = { children: PropTypes.node.isRequired };
