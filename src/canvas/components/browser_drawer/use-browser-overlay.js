import { useLayoutEffect, useState } from "react";

/** Follow the actual title bar, including responsive/native desktop sizing. */
export function useBrowserOverlay(open, onClose) {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const titleBar = document.querySelector('[data-testid="editor-top-bar"]');
    const measure = () =>
      setTop(Math.max(0, titleBar?.getBoundingClientRect().bottom ?? 0));
    const close = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (titleBar) observer.observe(titleBar);
    window.addEventListener("resize", measure);
    document.addEventListener("keydown", close, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("keydown", close, true);
    };
  }, [open, onClose]);
  return top;
}
