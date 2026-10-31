/** Use the existing provider settings for empty catalogs and configuration errors. */
export function openAgentModelSettings() {
  globalThis.window?.dispatchEvent(new CustomEvent("voo:open-settings", { detail: { tab: "providers" } }));
}
