import { useEffect, useLayoutEffect, useState } from "react";

const useMenuMeasureEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Expanded mobile panels move the zoom bar well above the viewport bottom. */
export function useZoomMenuHeight(open, triggerRef) {
  const [height, setHeight] = useState(null);
  useMenuMeasureEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    const editor = trigger?.closest('[data-testid="design-editor"]');
    const measure = () => {
      const top = Math.max(8, (editor?.getBoundingClientRect().top ?? 0) + 8);
      setHeight(Math.max(48, (trigger?.getBoundingClientRect().top ?? window.innerHeight) - top - 8));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (editor) observer.observe(editor);
    const stage = editor?.querySelector("[data-open-guard]");
    if (stage) observer.observe(stage);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [open, triggerRef]);
  return height;
}
