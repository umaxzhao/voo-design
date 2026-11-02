import { setSetting } from "../../shared/settings.js";

export const FIRST_RUN_KEY = "voo.firstRun.status";

// The introduction is shown on every launch. Automation stays quiet, and the
// URL flag still forces it on for manual testing.
export function shouldShowFirstRun() {
  if (new URLSearchParams(globalThis.location?.search ?? "").get("firstRun") === "1") return true;
  if (globalThis.navigator?.webdriver) return false;
  return true;
}

export function finishFirstRun(status = "completed") {
  setSetting(FIRST_RUN_KEY, status === "dismissed" ? "dismissed" : "completed");
}
