import { useEffect, useRef } from "react";

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const modalStack = [];

/** Include popup portals owned through aria-controls without trapping their focus away. */
function modalSurfaces(root) {
  const surfaces = [root];
  for (let index = 0; index < surfaces.length; index += 1) {
    for (const trigger of surfaces[index].querySelectorAll('[aria-controls][aria-expanded="true"]')) {
      for (const id of trigger.getAttribute("aria-controls").split(/\s+/)) {
        const panel = document.getElementById(id);
        if (panel && !surfaces.includes(panel)) surfaces.push(panel);
      }
    }
  }
  return surfaces;
}

function focusableElements(surfaces) {
  return [...new Set(surfaces.flatMap((surface) => [...surface.querySelectorAll(FOCUSABLE)]))]
    .filter((element) => element.getClientRects().length && !element.closest('[inert], [aria-hidden="true"]'));
}

/** A modal focus boundary compatible with the application's body-portalled selects. */
export function useModalFocus({ open, dialogRef, onClose, initialFocus }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = dialogRef.current;
    if (!open || !root) return undefined;
    const opener = document.activeElement;
    const scope = { root };
    modalStack.push(scope);
    const isTopmost = () => modalStack.at(-1) === scope;
    const focusFirst = () => {
      const preferred = initialFocus ? root.querySelector(initialFocus) : null;
      (preferred || focusableElements([root])[0] || root).focus({ preventScroll: true });
    };
    const ownsFocus = (target) => modalSurfaces(root).some((surface) => surface.contains(target));
    const handleFocus = (event) => {
      if (!isTopmost()) return;
      if (!ownsFocus(event.target)) focusFirst();
    };
    const handleKey = (event) => {
      if (!isTopmost() || event.defaultPrevented) return;
      if (event.key === "Escape") {
        // A nested select owns the first Escape, including when focus stays on its trigger.
        if (root.querySelector('[aria-haspopup][aria-expanded="true"]')) return;
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(modalSurfaces(root));
      const activeIndex = elements.indexOf(document.activeElement);
      if (!elements.length || (!event.shiftKey && activeIndex === elements.length - 1) || (event.shiftKey && activeIndex <= 0)) {
        event.preventDefault();
        (event.shiftKey ? elements.at(-1) || root : elements[0] || root).focus();
      }
    };

    focusFirst();
    document.addEventListener("focusin", handleFocus);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("focusin", handleFocus);
      window.removeEventListener("keydown", handleKey);
      const restoreFocus = isTopmost();
      modalStack.splice(modalStack.indexOf(scope), 1);
      if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, dialogRef, initialFocus]);
}
