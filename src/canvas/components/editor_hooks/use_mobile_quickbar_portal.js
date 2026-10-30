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

/** Camera transforms establish a fixed containing block; dock outside them. */
export function useMobileQuickbarPortal(barRef, active) {
  const mobile = useSyncExternalStore(subscribe, mobileSnapshot, serverSnapshot);
  const [target, setTarget] = useState(null);
  usePortalMeasureEffect(() => {
    setTarget(mobile && active ? barRef.current?.closest('[data-testid="design-editor"]') : null);
  }, [mobile, active, barRef]);
  return target;
}
