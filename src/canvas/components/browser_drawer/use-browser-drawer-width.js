import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "voo-browser-drawer-width";
const DEFAULT_WIDTH = 540;
const MIN_DRAWER_WIDTH = 320;
const MIN_WORKSPACE_WIDTH = 320;

function readSavedWidth() {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_WIDTH;
    const val = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(val) && val >= MIN_DRAWER_WIDTH) return val;
  } catch {
    // localStorage not accessible
  }
  return DEFAULT_WIDTH;
}

function saveWidth(w) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(Math.round(w)));
    }
  } catch {
    // localStorage write error ignored
  }
}

export function useBrowserDrawerWidth() {
  const [width, setWidth] = useState(readSavedWidth);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);

  const clamp = useCallback((desiredWidth) => {
    const screenW = typeof window !== "undefined" ? window.innerWidth : 1440;
    const maxAllowed = Math.max(MIN_DRAWER_WIDTH, screenW - MIN_WORKSPACE_WIDTH);
    return Math.min(maxAllowed, Math.max(MIN_DRAWER_WIDTH, desiredWidth));
  }, []);

  const resetToDefault = useCallback(() => {
    const clamped = clamp(DEFAULT_WIDTH);
    setWidth(clamped);
    saveWidth(clamped);
  }, [clamp]);

  const lastClickRef = useRef(0);

  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    const now = Date.now();
    if (now - lastClickRef.current < 350) {
      lastClickRef.current = 0;
      resetToDefault();
      return;
    }
    lastClickRef.current = now;

    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);

    const startX = e.clientX;
    const startW = width;

    const onPointerMove = (moveEvent) => {
      if (!isResizingRef.current) return;
      // Dragging separator to the left increases drawer width
      const delta = startX - moveEvent.clientX;
      const nextW = clamp(startW + delta);
      setWidth(nextW);
    };

    const onPointerUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
      setWidth((currentW) => {
        saveWidth(currentW);
        return currentW;
      });
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [width, clamp, resetToDefault]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth((prev) => {
        const next = clamp(prev + 20);
        saveWidth(next);
        return next;
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth((prev) => {
        const next = clamp(prev - 20);
        saveWidth(next);
        return next;
      });
    } else if (e.key === "Home" || e.key === "Enter") {
      resetToDefault();
    }
  }, [clamp, resetToDefault]);

  return {
    width,
    isResizing,
    handlePointerDown,
    resetToDefault,
    handleKeyDown,
    minWidth: MIN_DRAWER_WIDTH,
  };
}
