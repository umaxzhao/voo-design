import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "voo-welcome-sidebar-expanded";

function isNarrowScreen() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 768;
}

function readStoredExpanded() {
  if (isNarrowScreen()) return false;
  try {
    if (typeof localStorage === "undefined") return true;
    const item = localStorage.getItem(STORAGE_KEY);
    return item === null ? true : item === "true";
  } catch {
    return true;
  }
}

export function useWelcomeSidebarState() {
  const [expanded, setExpanded] = useState(readStoredExpanded);
  const [isNarrow, setIsNarrow] = useState(isNarrowScreen);

  useEffect(() => {
    const handleResize = () => {
      const narrow = isNarrowScreen();
      setIsNarrow(narrow);
      if (narrow) {
        // Narrow screens default to collapsed floating overlay
        setExpanded(false);
      } else {
        // Read stored preference on desktop resize
        try {
          const item = localStorage.getItem(STORAGE_KEY);
          setExpanded(item === null ? true : item === "true");
        } catch {
          setExpanded(true);
        }
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (!isNarrowScreen()) {
        try {
          localStorage.setItem(STORAGE_KEY, String(next));
        } catch {}
      }
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setExpanded(false);
    if (!isNarrowScreen()) {
      try {
        localStorage.setItem(STORAGE_KEY, "false");
      } catch {}
    }
  }, []);

  return {
    // A hidden compact entry must not strand a desktop's saved collapsed state.
    // Retain the old preference value without changing narrow-screen click routes.
    expanded: isNarrow ? expanded : true,
    isNarrow,
    toggle,
    close,
  };
}
