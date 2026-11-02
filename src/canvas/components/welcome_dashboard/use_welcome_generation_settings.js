import { useCallback, useEffect, useId, useRef, useState } from "react";
import { isOwnedPopoverTarget } from "../popover_scope.js";

/** Own positioning and dismissal for the one advanced-generation surface. */
export function useWelcomeGenerationSettings(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen);
  const [position, setPosition] = useState(null);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const scope = useId();
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gutter = 16;
      const width = Math.min(384, window.innerWidth - gutter * 2);
      const height = panelRef.current?.offsetHeight ?? 360;
      setPosition({
        width,
        left: Math.max(
          gutter,
          Math.min(rect.right - width, window.innerWidth - width - gutter),
        ),
        top: Math.max(
          gutter,
          Math.min(rect.bottom + 8, window.innerHeight - height - gutter),
        ),
        maxHeight: window.innerHeight - gutter * 2,
        overflowY: "auto",
      });
    };
    const onPointerDown = (event) => {
      if (
        rootRef.current?.contains(event.target) ||
        isOwnedPopoverTarget(event.target, scope)
      )
        return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      // A portalled select owns the first Escape, before its settings parent.
      if (
        [
          ...document.querySelectorAll('[role="listbox"][data-popover-scope]'),
        ].some((menu) => menu.getAttribute("data-popover-scope") === scope)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    place();
    const frame = requestAnimationFrame(() =>
      panelRef.current?.querySelector('[aria-checked="true"]')?.focus(),
    );
    const observer = new ResizeObserver(place);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, close, scope]);

  return { open, setOpen, position, rootRef, panelRef, triggerRef, scope };
}
