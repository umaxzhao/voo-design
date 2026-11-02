import { useLayoutEffect, useRef } from "react";

/** Keep every menu action reachable, including on small or resized viewports. */
export function useContextMenuBounds(x, y) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const place = () => {
      const menu = ref.current;
      if (!menu) return;
      const margin = 8;
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      menu.style.maxWidth = `${Math.max(0, width - margin * 2)}px`;
      menu.style.maxHeight = `${Math.max(0, height - margin * 2)}px`;
      const bounds = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(margin, Math.min(x, width - bounds.width - margin))}px`;
      menu.style.top = `${Math.max(margin, Math.min(y, height - bounds.height - margin))}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [x, y]);
  return ref;
}
