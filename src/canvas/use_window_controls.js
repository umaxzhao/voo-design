import { useCallback, useEffect, useRef, useState } from "react";

export function isMacPlatform() {
  if (typeof globalThis.vooDesktop?.platform === "string") {
    return globalThis.vooDesktop.platform === "darwin";
  }
  if (typeof navigator !== "undefined") {
    const dataPlatform = navigator.userAgentData?.platform?.toLowerCase() || "";
    if (dataPlatform.includes("mac")) return true;
    const navStr = `${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
    return navStr.includes("mac") || navStr.includes("iphone") || navStr.includes("ipad");
  }
  return false;
}

export function isWindowsPlatform() {
  if (typeof globalThis.vooDesktop?.platform === "string") {
    return globalThis.vooDesktop.platform === "win32";
  }
  if (typeof navigator !== "undefined") {
    const dataPlatform = navigator.userAgentData?.platform?.toLowerCase() || "";
    if (dataPlatform.includes("win")) return true;
    const navStr = `${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
    return navStr.includes("win");
  }
  return false;
}

/**
 * The window's own minimise / maximise / close, for a top bar to draw.
 *
 * `supported` is false on macOS (the traffic lights stay native) and in every
 * browser surface, so a top bar renders nothing and reserves nothing there.
 *
 * The state is asked for on mount and then pushed: the window can be maximised
 * by a double-click on a drag region, a Windows snap or a keyboard shortcut,
 * none of which pass through these buttons, and an icon still offering
 * "maximise" on a maximised window is the visible symptom.
 */
export function useWindowControls() {
  const bridge = globalThis.vooDesktop?.windowControls ?? null;
  const [maximized, setMaximized] = useState(false);
  const revision = useRef(0);
  const isMac = isMacPlatform();
  const isWindows = isWindowsPlatform();

  useEffect(() => {
    if (!bridge) return undefined;
    let live = true;
    const stop = bridge.onMaximizedChange?.((value) => {
      if (!live) return;
      revision.current++;
      setMaximized(Boolean(value));
    });
    // A compositor change outranks an older asynchronous query, including false.
    const requestedAt = revision.current;
    Promise.resolve(bridge.isMaximized?.()).then((value) => {
      if (live && revision.current === requestedAt) setMaximized(Boolean(value));
    }).catch(error => console.error("Could not read native window state", error));
    return () => {
      live = false;
      stop?.();
    };
  }, [bridge]);

  const minimize = useCallback(() => {
    void bridge?.minimize?.();
  }, [bridge]);

  const toggleMaximize = useCallback(async () => {
    const requestedAt = revision.current;
    const result = await bridge?.toggleMaximize?.();
    if (revision.current === requestedAt && typeof result?.maximized === "boolean") {
      setMaximized(result.maximized);
    }
  }, [bridge]);

  const close = useCallback(() => {
    void bridge?.close?.();
  }, [bridge]);

  return {
    supported: Boolean(bridge?.supported && ["linux", "win32"].includes(globalThis.vooDesktop?.platform)),
    isMac,
    isWindows,
    maximized,
    minimize,
    toggleMaximize,
    close,
  };
}
