import { useCallback, useRef, useState } from "react";

/** Measure the mounted editor, including changes from docked companion panels. */
export function useEditorWidth() {
  const [editorWidth, setEditorWidth] = useState(0);
  const observerRef = useRef(null);
  const editorRootRef = useCallback((root) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!root) return;
    const measure = () => setEditorWidth(root.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observerRef.current = observer;
  }, []);
  return { editorWidth, editorRootRef };
}
