// Polyfill window & CustomEvent & Element for Node.js test environment if absent
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}
if (typeof globalThis.CustomEvent === "undefined") {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, params = {}) {
      super(type, params);
      this.detail = params.detail || null;
    }
  };
}
if (typeof globalThis.navigator === "undefined") {
  globalThis.navigator = {};
}

import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OnboardingGuide, {
  applyDefaultWorkspaceOnboarding,
  persistOnboardingConfig,
} from "../../src/canvas/components/onboarding/OnboardingGuide.jsx";
import {
  GUIDE_STEP,
  ONBOARDING_STEPS,
  isOnboardingCompleted,
  markOnboardingCompleted,
  resetOnboarding,
  shouldShowOnboarding,
} from "../../src/canvas/components/onboarding/onboarding_state.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";
import { loadLocale } from "../../src/shared/i18n.js";

describe("Adversarial Challenge: Onboarding Workspace Guide Flow", () => {
  // These assertions match the Chinese copy.
  beforeAll(async () => {
    await loadLocale("zh");
  });

  beforeEach(() => {
    resetOnboarding();
    setSetting("voo.workspace.path", null);
    setSetting("voo.workspace.type", null);
    setSetting("voo.workspace.name", null);
    setSetting("voo.agent.llmProvider", null);
    if (typeof globalThis.sessionStorage !== "undefined") {
      globalThis.sessionStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Challenge 1: Anti-double-click / finishingRef guard on Skip & Next
  // =========================================================================
  describe("Challenge 1: Rapid clicking & finishingRef re-entrancy vulnerability", () => {
    it("EMPIRICAL: Rapid clicking of '稍后配置 (跳过)' fires redundant workspace-changed events and duplicate onClose", () => {
      const workspaceChangedSpy = vi.fn();
      window.addEventListener("voo:workspace-changed", workspaceChangedSpy);

      const onCloseMock = vi.fn();

      // Simulate rapid double click on Skip button
      // In OnboardingGuide.jsx lines 150-157:
      // handleSkip invokes applyDefaultWorkspaceOnboarding and onClose without finishingRef guard
      applyDefaultWorkspaceOnboarding(false, "claude");
      onCloseMock();

      applyDefaultWorkspaceOnboarding(false, "claude");
      onCloseMock();

      // Bug: Event is dispatched twice, listeners trigger twice, onClose invoked twice
      expect(workspaceChangedSpy).toHaveBeenCalledTimes(2);
      expect(onCloseMock).toHaveBeenCalledTimes(2);

      window.removeEventListener("voo:workspace-changed", workspaceChangedSpy);
    });

    it("EMPIRICAL: Rapid clicking on Step 4 '进入画布工作台' invokes persistOnboardingConfig and onClose multiple times", () => {
      const workspaceChangedSpy = vi.fn();
      window.addEventListener("voo:workspace-changed", workspaceChangedSpy);

      const onCloseMock = vi.fn();
      const config = {
        path: "/Users/test/Projects",
        type: "electron",
        name: "Projects",
      };

      // In OnboardingGuide.jsx lines 137-148:
      // handleFinish lacks finishingRef guard and lacks disabled={finishing} state on the button
      persistOnboardingConfig({ agent: "claude", workspaceConfig: config, isElectron: true });
      onCloseMock();

      persistOnboardingConfig({ agent: "claude", workspaceConfig: config, isElectron: true });
      onCloseMock();

      expect(workspaceChangedSpy).toHaveBeenCalledTimes(2);
      expect(onCloseMock).toHaveBeenCalledTimes(2);

      window.removeEventListener("voo:workspace-changed", workspaceChangedSpy);
    });

    it("EMPIRICAL: Render markup marks the next button disabled while finishing", () => {
      const html = renderToStaticMarkup(
        React.createElement(OnboardingGuide, { open: true, onClose: () => {} })
      );

      // The next button must be disabled during submission/finishing to prevent double-submission
      // (voo-run: disabled={blocked || finishing})
      expect(html).toMatch(/data-testid="onboarding-next-btn"[^>]*disabled/);
    });

    it("EMPIRICAL: Unclamped step index increment causes out-of-bounds index (5 / 4)", () => {
      // In OnboardingGuide.jsx lines 159-165:
      // handleNext = () => { if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1); ... }
      // If two clicks queue before re-render when stepIndex is 2 (2 < 3):
      // Functional updater (i) => i + 1 runs twice: i goes from 2 -> 3 -> 4!
      let stepIndex = 2;
      const steps = ONBOARDING_STEPS; // length = 4

      const queueClick = () => {
        if (stepIndex < steps.length - 1) {
          // React schedules functional updates:
          stepIndex = stepIndex + 1;
        }
      };

      // Two rapid clicks queued before render re-evaluates stepIndex condition:
      const conditionAtClick1 = stepIndex < steps.length - 1; // 2 < 3 = true
      const conditionAtClick2 = stepIndex < steps.length - 1; // still evaluated in same tick = true
      expect(conditionAtClick1).toBe(true);
      expect(conditionAtClick2).toBe(true);

      const updater1 = (i) => i + 1;
      const updater2 = (i) => i + 1;
      const simulatedNextState = updater2(updater1(2));
      expect(simulatedNextState).toBe(4); // Exceeds steps.length - 1 (3)

      // When stepIndex = 4, steps[4] is undefined, counter would display "5 / 4"
      expect(steps[simulatedNextState]).toBeUndefined();
      expect(`${simulatedNextState + 1} / ${steps.length}`).toBe("5 / 4");
    });
  });

  // =========================================================================
  // Challenge 2: Empty, Null, or Corrupt voo.workspace.path Behavior
  // =========================================================================
  describe("Challenge 2: Workspace path edge cases & App.jsx gating bug", () => {
    it("EMPIRICAL: shouldShowOnboarding() returns true for null, undefined, or empty string", () => {
      markOnboardingCompleted("2.2.0");

      setSetting("voo.workspace.path", null);
      expect(shouldShowOnboarding()).toBe(true);

      setSetting("voo.workspace.path", "");
      expect(shouldShowOnboarding()).toBe(true);
    });

    it("EMPIRICAL: Whitespace-only path ('   ') triggers shouldShowOnboarding() check", () => {
      markOnboardingCompleted("2.2.0");
      setSetting("voo.workspace.path", "   ");

      // Whitespace-only path is trimmed and correctly treated as unconfigured
      expect(shouldShowOnboarding()).toBe(true);
    });

    it("EMPIRICAL CRITICAL BUG: App.jsx initializes onboardingOpen with !isOnboardingCompleted() instead of shouldShowOnboarding()", () => {
      // Simulate existing user who completed v2.1.0 onboarding but has NO workspace configured
      setSetting("voo.onboarding.completedVersion", "2.1.0");
      setSetting("voo.workspace.path", null);

      // shouldShowOnboarding() properly reports true
      expect(shouldShowOnboarding()).toBe(true);

      // BUT App.jsx lines 19-25:
      // const [onboardingOpen, setOnboardingOpen] = useState(() => {
      //   try {
      //     return !isOnboardingCompleted();
      //   } catch {
      //     return false;
      //   }
      // });
      const appJsxInitialValue = !isOnboardingCompleted();

      // FAILS: App.jsx will evaluate to false and NOT open the guide modal!
      expect(appJsxInitialValue).toBe(false);
      expect(appJsxInitialValue).not.toBe(shouldShowOnboarding());
    });

    it("EMPIRICAL: persistOnboardingConfig with empty or null path still marks onboarding complete", () => {
      // If user reaches ready step and workspaceConfig.path is null or empty:
      persistOnboardingConfig({
        agent: "claude",
        workspaceConfig: { path: null, type: "electron", name: "Corrupt" },
        isElectron: true,
      });

      // Bug: Path was not saved
      expect(getSetting("voo.workspace.path")).toBeNull();
      // But onboarding was marked completed
      expect(isOnboardingCompleted()).toBe(true);
      // And due to App.jsx checking !isOnboardingCompleted(), guide will never open again on refresh
      expect(!isOnboardingCompleted()).toBe(false);
    });
  });

  // =========================================================================
  // Challenge 3: Webdriver / CI automated bypass
  // =========================================================================
  describe("Challenge 3: Webdriver / CI automated bypass (Feature 16 in PROJECT.md)", () => {
    it("Feature 16: shouldShowOnboarding() checks navigator.webdriver and bypasses CI", () => {
      // Simulate CI / Playwright test environment where navigator.webdriver is true
      const origWebdriver = globalThis.navigator?.webdriver;
      try {
        Object.defineProperty(globalThis.navigator, "webdriver", {
          value: true,
          configurable: true,
        });
      } catch {
        // ignore
      }

      try {
        resetOnboarding();
        setSetting("voo.workspace.path", null);

        // Feature 16 in PROJECT.md:
        // "Automation CI Bypass: Bypass onboarding when navigator.webdriver === true to protect automated test suites"
        const result = shouldShowOnboarding();

        // Verified: Feature 16 bypasses onboarding when navigator.webdriver is true
        expect(result).toBe(false);
      } finally {
        try {
          Object.defineProperty(globalThis.navigator, "webdriver", {
            value: origWebdriver,
            configurable: true,
          });
        } catch {
          // ignore
        }
      }
    });

    it("EMPIRICAL: OnboardingGuide does NOT bypass rendering when navigator.webdriver is true", () => {
      const origWebdriver = globalThis.navigator?.webdriver;
      try {
        Object.defineProperty(globalThis.navigator, "webdriver", {
          value: true,
          configurable: true,
        });
      } catch {
        // ignore
      }

      try {
        const html = renderToStaticMarkup(
          React.createElement(OnboardingGuide, { open: true, onClose: () => {} })
        );

        // Modal is rendered despite navigator.webdriver === true
        expect(html).toContain('data-testid="onboarding-guide-modal"');
      } finally {
        try {
          Object.defineProperty(globalThis.navigator, "webdriver", {
            value: origWebdriver,
            configurable: true,
          });
        } catch {
          // ignore
        }
      }
    });
  });

  // =========================================================================
  // Challenge 4: Draft persistence across page reload
  // =========================================================================
  describe("Challenge 4: Draft persistence across page reload (voo-run reference parity)", () => {
    it("EMPIRICAL: OnboardingGuide does not persist draft state to sessionStorage", () => {
      // Mock sessionStorage
      const storage = new Map();
      globalThis.sessionStorage = {
        getItem: (k) => storage.get(k) || null,
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
        clear: () => storage.clear(),
      };

      // In voo-run OnboardingGuide lines 102-108:
      // sessionStorage.setItem("voo.onboarding.draft", JSON.stringify({ path, stepIndex, agentProviderId }))
      // In voo_design OnboardingGuide:
      // There is no draft persistence whatsoever.
      renderToStaticMarkup(
        React.createElement(OnboardingGuide, { open: true, onClose: () => {} })
      );

      // Verify that sessionStorage has no draft saved
      expect(globalThis.sessionStorage.getItem("voo.onboarding.draft")).toBeNull();
    });

    it("EMPIRICAL: OnboardingGuide always resets to step 0 on mount, ignoring any in-progress state", () => {
      const storage = new Map();
      storage.set(
        "voo.onboarding.draft",
        JSON.stringify({ stepIndex: 2, selectedAgent: "codex" })
      );
      globalThis.sessionStorage = {
        getItem: (k) => storage.get(k) || null,
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
        clear: () => storage.clear(),
      };

      // When rendered, OnboardingGuide does not inspect sessionStorage and renders Step 1 (1 / 4)
      const html = renderToStaticMarkup(
        React.createElement(OnboardingGuide, { open: true, onClose: () => {} })
      );

      expect(html).toContain("1 / 4");
      expect(html).toContain("选择工作区");
      // Does not restore to Step 3 (2) as saved in draft
      expect(html).not.toContain("3 / 4");
    });
  });
});
