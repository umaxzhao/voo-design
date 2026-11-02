/**
 * Runtime environment detection for VOO Design (Dual Target: Desktop & Web).
 */

export const CANVAS_MODE = Object.freeze({
  FRAME: "frame",
  EXTENSION: "extension",
  BRIDGE: "bridge",
  DESKTOP: "desktop",
  STANDALONE: "standalone",
});

export function hasDesktopApis() {
  return typeof window !== "undefined" && Boolean(window.electronAPI || window.desktopBridge);
}

export function getEnvironment() {
  return {
    mode: hasDesktopApis() ? CANVAS_MODE.DESKTOP : CANVAS_MODE.STANDALONE,
    hosted: false,
    bridge: null,
  };
}

export async function detectEnvironment() {
  return getEnvironment();
}

export function resolveHostOrigin() {
  return null;
}

export function resolveDesktopWebOrigin() {
  return null;
}

export function isElectron() {
  return hasDesktopApis();
}

export function isStandalone() {
  return !hasDesktopApis();
}
