import { getSetting, setSetting } from "../../shared/settings.js";

export const FIRST_RUN_KEY = "voo.firstRun.status";

/**
 * The introduction is a one-time first-run surface. Finishing or skipping it
 * persists a status, so later launches stay quiet; automation stays quiet by
 * default and the URL flag still forces it on for manual testing.
 */
export function shouldShowFirstRun() {
  if (new URLSearchParams(globalThis.location?.search ?? "").get("firstRun") === "1") return true;
  if (globalThis.navigator?.webdriver) return false;
  const status = getSetting(FIRST_RUN_KEY);
  return status !== "completed" && status !== "dismissed";
}

export function finishFirstRun(status = "completed") {
  setSetting(FIRST_RUN_KEY, status === "dismissed" ? "dismissed" : "completed");
}
