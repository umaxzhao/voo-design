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

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OnboardingGuide, {
  applyDefaultWorkspaceOnboarding,
  persistOnboardingConfig,
} from "../../src/canvas/components/onboarding/OnboardingGuide.jsx";
import { OnboardingStepProgress } from "../../src/canvas/components/onboarding/onboarding_step_progress.jsx";
import StepWorkspace from "../../src/canvas/components/onboarding/step_workspace.jsx";
import StepReady from "../../src/canvas/components/onboarding/step_ready.jsx";
import { WebFsaWorkspaceDriver } from "../../src/services/workspace_storage.js";
import {
  GUIDE_STEP,
  ONBOARDING_STEPS,
  WORKSPACE_GUIDE_STEPS,
  isOnboardingCompleted,
  markOnboardingCompleted,
  resetOnboarding,
  shouldShowOnboarding,
} from "../../src/canvas/components/onboarding/onboarding_state.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";

describe("Milestone 2: Onboarding Workspace Guide", () => {
  beforeEach(() => {
    resetOnboarding();
    setSetting("voo.workspace.path", null);
    setSetting("voo.workspace.type", null);
    setSetting("voo.workspace.name", null);
    setSetting("voo.agent.llmProvider", null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. State Contracts & shouldShowOnboarding()", () => {
    it("defines 4-step wizard sequence with WORKSPACE_SETUP as Step 1", () => {
      expect(GUIDE_STEP.WORKSPACE_SETUP).toBe("workspace_setup");
      expect(GUIDE_STEP.AGENT_SELECT).toBe("agent_select");
      expect(GUIDE_STEP.LOCAL_DETECT).toBe("local_detect");
      expect(GUIDE_STEP.READY).toBe("ready");

      expect(ONBOARDING_STEPS).toEqual([
        GUIDE_STEP.WORKSPACE_SETUP,
        GUIDE_STEP.AGENT_SELECT,
        GUIDE_STEP.LOCAL_DETECT,
        GUIDE_STEP.READY,
      ]);
      expect(ONBOARDING_STEPS.length).toBe(4);
      expect(WORKSPACE_GUIDE_STEPS).toBe(ONBOARDING_STEPS);
    });

    it("returns shouldShowOnboarding() = true when onboarding not completed", () => {
      resetOnboarding();
      setSetting("voo.workspace.path", "/Users/tester/Projects");
      expect(isOnboardingCompleted()).toBe(false);
      expect(shouldShowOnboarding()).toBe(true);
    });

    it("returns shouldShowOnboarding() = true when onboarding completed but workspace.path is empty", () => {
      markOnboardingCompleted();
      setSetting("voo.workspace.path", "");
      expect(isOnboardingCompleted()).toBe(true);
      expect(shouldShowOnboarding()).toBe(true);

      setSetting("voo.workspace.path", null);
      expect(shouldShowOnboarding()).toBe(true);
    });

    it("returns shouldShowOnboarding() = false when onboarding is completed AND workspace.path is configured", () => {
      markOnboardingCompleted();
      setSetting("voo.workspace.path", "/Users/tester/Documents/VOO/Projects");
      expect(isOnboardingCompleted()).toBe(true);
      expect(shouldShowOnboarding()).toBe(false);
    });
  });

  describe("2. StepWorkspace Component Rendering", () => {
    it("renders StepWorkspace in Web mode with FSA and Virtual options", () => {
      const html = renderToStaticMarkup(
        React.createElement(StepWorkspace, {
          workspaceConfig: {
            path: "Virtual Workspace",
            type: "web-idb",
            name: "Virtual Workspace",
          },
          onSelectConfig: () => {},
        })
      );

      expect(html).toContain('data-testid="onboarding-step-workspace"');
      expect(html).toContain('data-testid="workspace-option-fsa"');
      expect(html).toContain('data-testid="workspace-option-virtual"');
      expect(html).toContain('data-testid="onboarding-selected-workspace-path"');
      expect(html).toContain("沙盒工作区");
      expect(html).toContain("Virtual Workspace");
    });

    it("renders StepWorkspace in simulated Electron environment with native controls", () => {
      const origElectron = window.electronAPI;
      window.electronAPI = {
        workspace: {
          getConfig: vi.fn().mockResolvedValue({ path: "/Users/test/VOO", type: "electron" }),
          getDefaultDirectory: vi.fn().mockResolvedValue("/Users/test/Documents/VOO/Projects"),
          chooseDirectory: vi.fn(),
        },
      };

      try {
        const html = renderToStaticMarkup(
          React.createElement(StepWorkspace, {
            workspaceConfig: {
              path: "/Users/test/Documents/VOO/Projects",
              type: "electron",
              name: "VOO Projects",
            },
            onSelectConfig: () => {},
          })
        );

        expect(html).toContain('data-testid="workspace-option-native"');
        expect(html).toContain('data-testid="workspace-option-native"');
        expect(html).toContain('data-testid="workspace-option-native-custom"');
        expect(html).toContain("本地磁盘");
        expect(html).toContain("/Users/test/Documents/VOO/Projects");
      } finally {
        if (origElectron) window.electronAPI = origElectron;
        else delete window.electronAPI;
      }
    });
  });

  describe("3. StepReady Workspace Summary Rendering", () => {
    it("renders StepReady with workspace summary card alongside agent card", () => {
      const html = renderToStaticMarkup(
        React.createElement(StepReady, {
          selectedAgent: "claude",
          workspaceConfig: {
            path: "/Users/designer/Documents/VOO/Projects",
            type: "electron",
            name: "VOO Projects",
          },
        })
      );

      expect(html).toContain('data-testid="onboarding-ready-workspace-summary"');
      expect(html).toContain("/Users/designer/Documents/VOO/Projects");
      expect(html).toContain("本地磁盘");

      expect(html).toContain('data-testid="onboarding-ready-agent-summary"');
      expect(html).toContain('data-testid="onboarding-ready-agent-summary"');
      expect(html).toContain("Claude Code");
    });
  });

  describe("4. OnboardingGuide 4-Step Wizard Flow & Skip Logic", () => {
    it("renders 4-step progress bar and initial Step 1 Workspace title", () => {
      const html = renderToStaticMarkup(
        React.createElement(OnboardingGuide, { open: true, onClose: () => {} })
      );

      expect(html).toContain('data-testid="onboarding-guide-modal"');
      expect(html).toContain('data-step-count="4"');
      expect(html).toContain("1 / 4");
      expect(html).toContain("选择工作区");
      expect(html).toContain('data-testid="onboarding-step-workspace"');
      expect(html).toContain('data-testid="onboarding-skip-btn"');
      expect(html).toContain("稍后配置 (跳过)");
    });

    it("applyDefaultWorkspaceOnboarding sets default directory and marks onboarding complete", () => {
      const changedSpy = vi.fn();
      window.addEventListener("voo:workspace-changed", changedSpy);

      // Web mode default
      applyDefaultWorkspaceOnboarding(false, "claude");

      expect(isOnboardingCompleted()).toBe(true);
      expect(getSetting("voo.workspace.path")).toBe("Virtual Workspace");
      expect(getSetting("voo.workspace.type")).toBe("web-idb");
      expect(getSetting("voo.workspace.name")).toBe("Virtual Workspace");
      expect(getSetting("voo.agent.llmProvider")).toBe("claude");
      expect(changedSpy).toHaveBeenCalled();

      // Electron mode default
      applyDefaultWorkspaceOnboarding(true, "codex");
      expect(getSetting("voo.workspace.path")).toBe("~/Documents/VOO/Projects");
      expect(getSetting("voo.workspace.type")).toBe("electron");
      expect(getSetting("voo.workspace.name")).toBe("VOO Projects");

      window.removeEventListener("voo:workspace-changed", changedSpy);
    });

    it("persistOnboardingConfig saves custom workspace choice and marks onboarding complete", () => {
      const changedSpy = vi.fn();
      window.addEventListener("voo:workspace-changed", changedSpy);

      persistOnboardingConfig({
        agent: "antigravity",
        workspaceConfig: {
          path: "/Volumes/ExtDisk/VOO_Work",
          type: "electron",
          name: "VOO_Work",
        },
        isElectron: true,
      });

      expect(isOnboardingCompleted()).toBe(true);
      expect(getSetting("voo.workspace.path")).toBe("/Volumes/ExtDisk/VOO_Work");
      expect(getSetting("voo.workspace.type")).toBe("electron");
      expect(getSetting("voo.workspace.name")).toBe("VOO_Work");
      expect(getSetting("voo.agent.llmProvider")).toBe("antigravity");
      expect(changedSpy).toHaveBeenCalled();

      window.removeEventListener("voo:workspace-changed", changedSpy);
    });

    it("step progress bar advances cleanly across all 4 steps", () => {
      const html = renderToStaticMarkup(
        React.createElement(OnboardingStepProgress, {
          stepIndex: 3,
          steps: ONBOARDING_STEPS,
          label: "Step 4 of 4",
        })
      );

      expect(html).toContain('data-step-count="4"');
      expect(html).toContain('aria-valuenow="4"');
    });
  });

  describe("5. Milestone 2 Remediation & CI Hardening", () => {
    it("bypasses onboarding when navigator.webdriver is true (Feature 16)", () => {
      const orig = globalThis.navigator?.webdriver;
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
        expect(shouldShowOnboarding()).toBe(false);
      } finally {
        try {
          Object.defineProperty(globalThis.navigator, "webdriver", {
            value: orig,
            configurable: true,
          });
        } catch {
          // ignore
        }
      }
    });

    it("renders StepWorkspace non-FSA badge [需 Chrome/Edge] and fallback hint when FSA is unavailable", () => {
      const origIsAvailable = WebFsaWorkspaceDriver.isAvailable;
      WebFsaWorkspaceDriver.isAvailable = () => false;

      try {
        const html = renderToStaticMarkup(
          React.createElement(StepWorkspace, {
            workspaceConfig: {
              path: "Virtual Workspace",
              type: "web-idb",
              name: "Virtual Workspace",
            },
            onSelectConfig: () => {},
          })
        );

                expect(html).toContain("当前浏览器不支持直接挂载");
        expect(html).not.toContain("data-testid=\"workspace-option-fsa-btn\"");
      } finally {
        WebFsaWorkspaceDriver.isAvailable = origIsAvailable;
      }
    });
  });
});
