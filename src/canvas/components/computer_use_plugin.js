export const COMPUTER_USE_PLUGIN_ID = "computer-use";
const STORAGE_KEY = "voo.plugin.computer-use.enabled";
const CHANGE_EVENT = "voo:computer-use-plugin-changed";

export function isComputerUseEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setComputerUseEnabled(enabled) {
  localStorage.setItem(STORAGE_KEY, String(Boolean(enabled)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function hasComputerUseBridge() {
  return typeof globalThis.vooDesktop?.computerUse?.invoke === "function";
}

export { CHANGE_EVENT as COMPUTER_USE_PLUGIN_CHANGED_EVENT };
