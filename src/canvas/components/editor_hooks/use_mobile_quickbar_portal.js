import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 768px)";
const usePortalMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const mobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const serverSnapshot = () => false;
const subscribe = (listener) => {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};

/** Keep mobile and docked taskbars in the same overlay as the zoom controls. */
export function useMobileQuickbarPortal(barRef, active, docked = false) {
  const mobile = useSyncExternalStore(subscribe, mobileSnapshot, serverSnapshot);
  const [target, setTarget] = useState(null);
  usePortalMeasureEffect(() => {
    const editor = barRef.current?.closest('[data-testid="design-editor"]');
    const zoomOverlay = editor?.querySelector('[data-testid="editor-zoom-position"]');
    setTarget((mobile || docked) && active ? zoomOverlay ?? editor : null);
  }, [mobile, active, barRef, docked]);
  return target;
}
