import { getSetting, setSetting } from "../../shared/settings.js";

export const FIRST_RUN_KEY = "voo.firstRun.status";

export function shouldShowFirstRun() {
  if (globalThis.navigator?.webdriver) return false;
  // Existing users who finished workspace setup need no new introduction.
  return !getSetting(FIRST_RUN_KEY) && !getSetting("voo.onboarding.completedVersion");
}

export function finishFirstRun(status = "completed") {
  setSetting(FIRST_RUN_KEY, status === "dismissed" ? "dismissed" : "completed");
}
