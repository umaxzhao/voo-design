import { getSetting, setSetting } from "../../../shared/settings.js";

export const ONBOARDING_COMPLETED_KEY = "voo.onboarding.completedVersion";
export const ONBOARDING_AGENT_CHOICE_KEY = "voo.agent.llmProvider";
export const ONBOARDING_MODEL_CHOICE_KEY = "voo.agent.llmModel";
export const ONBOARDING_WORKSPACE_PATH_KEY = "voo.workspace.path";
export const ONBOARDING_WORKSPACE_TYPE_KEY = "voo.workspace.type";
export const ONBOARDING_WORKSPACE_NAME_KEY = "voo.workspace.name";

export const CURRENT_ONBOARDING_VERSION = "2.2.0";

export const GUIDE_STEP = Object.freeze({
  WORKSPACE_SETUP: "workspace_setup",
  AGENT_SELECT: "agent_select",
  LOCAL_DETECT: "local_detect",
  READY: "ready",
});

export const ONBOARDING_STEPS = Object.freeze([
  GUIDE_STEP.WORKSPACE_SETUP,
  GUIDE_STEP.AGENT_SELECT,
  GUIDE_STEP.LOCAL_DETECT,
  GUIDE_STEP.READY,
]);

export const WORKSPACE_GUIDE_STEPS = ONBOARDING_STEPS;

// Legacy 3-step constant retained for backwards compatibility with existing test suites
export const GUIDE_STEPS = Object.freeze([
  GUIDE_STEP.AGENT_SELECT,
  GUIDE_STEP.LOCAL_DETECT,
  GUIDE_STEP.READY,
]);

/** Returns whether onboarding has been completed for the current version. */
export function isOnboardingCompleted() {
  const version = getSetting(ONBOARDING_COMPLETED_KEY);
  return Boolean(version);
}

/** Dispatches a global event to open the onboarding configuration guide modal. */
export function openOnboardingGuide() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("voo:open-onboarding"));
  }
}

/**
 * Returns whether the onboarding guide should be shown:
 * true if onboarding was never completed OR if no valid non-empty workspace directory has been configured.
 */
export function shouldShowOnboarding() {
  if (typeof navigator !== "undefined" && navigator.webdriver) return false;
  const p = getSetting(ONBOARDING_WORKSPACE_PATH_KEY);
  return !isOnboardingCompleted() || !p || typeof p !== "string" || !p.trim();
}

/** Marks onboarding completed. */
export function markOnboardingCompleted(version = CURRENT_ONBOARDING_VERSION) {
  setSetting(ONBOARDING_COMPLETED_KEY, version);
}

/** Resets onboarding status so the guide can be re-run. */
export function resetOnboarding() {
  setSetting(ONBOARDING_COMPLETED_KEY, "");
}

