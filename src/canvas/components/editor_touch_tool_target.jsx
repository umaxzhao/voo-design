import { cloneElement, isValidElement, useSyncExternalStore } from "react";

const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";
const touchSnapshot = () => typeof window !== "undefined" &&
  typeof window.matchMedia === "function" && window.matchMedia(TOUCH_QUERY).matches;
const serverSnapshot = () => false;
function subscribeTouch(callback) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(TOUCH_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export const useTouchToolTarget = () => useSyncExternalStore(subscribeTouch, touchSnapshot, serverSnapshot);

export function touchToolAttributes({ active, open, menuId, label, menuLabel }) {
  return {
    "data-toolbar-touch-tool": "true",
    "aria-label": active ? `${label} · ${menuLabel}` : label,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? `editor-${menuId}-menu-list` : undefined,
  };
}

/** Family entries contain one tool button, optionally wrapped in its tooltip. */
export function withTouchToolTarget(child, options) {
  if (!isValidElement(child)) return child;
  if (child.type === "button") {
    return cloneElement(child, touchToolAttributes({ ...options, label: child.props["aria-label"] }));
  }
  const button = child.props.children;
  if (!isValidElement(button) || button.type !== "button") return child;
  return cloneElement(child, {
    title: options.active ? `${child.props.title} · ${options.menuLabel}` : child.props.title,
    children: withTouchToolTarget(button, options),
  });
}
