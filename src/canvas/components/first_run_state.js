import { getSetting, setSetting } from "../../shared/settings.js";

export const FIRST_RUN_KEY = "voo.firstRun.status";

// The introduction is shown on every launch by default. The harness side panel
// asks for it `once`: there it is a plugin guide, so it appears only until the
// user finishes or dismisses it once. Automation stays quiet, and the URL flag
// still forces it on for manual testing.
export function shouldShowFirstRun({ once = false } = {}) {
  if (new URLSearchParams(globalThis.location?.search ?? "").get("firstRun") === "1") return true;
  if (globalThis.navigator?.webdriver) return false;
  if (!once) return true;
  const status = getSetting(FIRST_RUN_KEY);
  return status !== "completed" && status !== "dismissed";
}

export function finishFirstRun(status = "completed") {
  setSetting(FIRST_RUN_KEY, status === "dismissed" ? "dismissed" : "completed");
}
