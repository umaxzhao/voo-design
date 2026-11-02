import { useCallback, useEffect, useState } from "react";

export function getDetectedPlatform() {
  const desktopPlatform =
    (typeof globalThis.vooDesktop?.platform === "string" && globalThis.vooDesktop.platform) ||
    (typeof globalThis.electronAPI?.platform === "string" && globalThis.electronAPI.platform);

  if (desktopPlatform) {
    if (desktopPlatform === "darwin") return "mac";
    if (desktopPlatform === "win32") return "windows";
    if (desktopPlatform === "linux") return "linux";
    return desktopPlatform;
  }

  if (typeof navigator !== "undefined") {
    const dataPlatform = navigator.userAgentData?.platform?.toLowerCase() || "";
    if (dataPlatform.includes("mac")) return "mac";
    if (dataPlatform.includes("win")) return "windows";
    if (dataPlatform.includes("linux")) return "linux";

    const navStr = `${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
    if (navStr.includes("mac") || navStr.includes("iphone") || navStr.includes("ipad")) return "mac";
    if (navStr.includes("win")) return "windows";
    if (navStr.includes("linux") || navStr.includes("x11")) return "linux";
  }

  if (typeof process !== "undefined" && typeof process.platform === "string") {
    if (process.platform === "darwin") return "mac";
    if (process.platform === "win32") return "windows";
    if (process.platform === "linux") return "linux";
  }

  return "unknown";
}

export function isMacPlatform() {
  return getDetectedPlatform() === "mac";
}

export function isWindowsPlatform() {
  return getDetectedPlatform() === "windows";
}

export function isLinuxPlatform() {
  return getDetectedPlatform() === "linux";
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
  const isMac = isMacPlatform();
  const isWindows = isWindowsPlatform();
  const isLinux = isLinuxPlatform();

  useEffect(() => {
    if (!bridge) return undefined;
    let live = true;
    // `isMaximized` may resolve after the subscription delivers a newer value;
    // the flag keeps the slower, older answer from overwriting it.
    bridge.isMaximized?.().then((value) => {
      if (live) setMaximized((current) => current || Boolean(value));
    });
    const stop = bridge.onMaximizedChange?.((value) =>
      setMaximized(Boolean(value)),
    );
    return () => {
      live = false;
      stop?.();
    };
  }, [bridge]);

  const minimize = useCallback(() => {
    void bridge?.minimize?.();
  }, [bridge]);

  const toggleMaximize = useCallback(async () => {
    const result = await bridge?.toggleMaximize?.();
    if (result && typeof result.maximized === "boolean") {
      setMaximized(result.maximized);
    }
  }, [bridge]);

  const close = useCallback(() => {
    void bridge?.close?.();
  }, [bridge]);

  return {
    supported: Boolean(bridge?.supported),
    isMac,
    isWindows,
    isLinux,
    maximized,
    minimize,
    toggleMaximize,
    close,
  };
}
