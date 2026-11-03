// Polyfill window & CustomEvent & Element for Node.js test environment if absent
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CLI_MODEL_GROUPS,
  IMAGE_MODEL_GROUPS,
  availableModelGroups,
  getModelDisplayParts,
  isWebImageModel,
  DEFAULT_DESIGN_MODEL,
  DEFAULT_IMAGE_MODEL,
} from "../../src/canvas/components/agent-panel/model_catalog.js";
import {
  probeExtensionStatus,
  isExtensionCompatible,
  EXTENSION_STATUS,
} from "../../src/canvas/agent/extension_detection.js";
import {
  validateTargetLayer,
  applySafeImageResult,
} from "../../src/canvas/agent/image_replacement_guard.js";
import AgentPanelView from "../../src/canvas/components/agent-panel/agent_panel_view.jsx";
import AgentExtensionDialog from "../../src/canvas/components/agent-panel/agent_extension_dialog.jsx";
import { getSetting, setSetting } from "../../src/shared/settings.js";
import { AGENT_SETTING, AGENT_DEFAULTS } from "../../src/canvas/agent/agent-settings.js";

describe("VOO-F-AGENT-IMG01: Agent Dual Modes & Image Taskbar Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Model Catalog & Mode Filtering", () => {
    it("places 'GPT 网页' and 'Gemini 网页' at the top of image models in strict order", () => {
      const firstGroup = IMAGE_MODEL_GROUPS[0];
      expect(firstGroup.cliId).toBe("web");
      expect(firstGroup.name).toBe("网页免 Key 生图");
      expect(firstGroup.models[0]).toEqual({ id: "web:chatgpt", label: "GPT 网页" });
      expect(firstGroup.models[1]).toEqual({ id: "web:gemini", label: "Gemini 网页" });
    });

    it("filters models dynamically based on mode", () => {
      const designGroups = availableModelGroups([], "design");
      const imageGroups = availableModelGroups([], "image");

      // Design groups should contain Claude, Codex, Antigravity
      const designCliIds = designGroups.map((g) => g.cliId);
      expect(designCliIds).toContain("claude");
      expect(designCliIds).toContain("codex");
      expect(designCliIds).toContain("antigravity");
      expect(designCliIds).not.toContain("web");

      // Image groups should contain web image models and API image providers
      const imageCliIds = imageGroups.map((g) => g.cliId);
      expect(imageCliIds).toContain("web");
      expect(imageCliIds).toContain("302");
      expect(imageCliIds).toContain("dashscope");
      expect(imageCliIds).not.toContain("claude");
    });

    it("correctly identifies web image models", () => {
      expect(isWebImageModel("web:chatgpt")).toBe(true);
      expect(isWebImageModel("web:gemini")).toBe(true);
      expect(isWebImageModel("302ai:flux-schnell")).toBe(false);
      expect(isWebImageModel("claude:claude-opus-5-5")).toBe(false);
    });

    it("preserves full display label for web models without truncating '网页'", () => {
      const gptParts = getModelDisplayParts("web:chatgpt");
      expect(gptParts.modelName).toBe("GPT 网页");

      const geminiParts = getModelDisplayParts("web:gemini");
      expect(geminiParts.modelName).toBe("Gemini 网页");
    });
  });

  describe("2. Dual-Mode Independent Model Persistence", () => {
    it("persists design and image models in distinct settings keys", () => {
      setSetting(AGENT_SETTING.DESIGN_MODEL_ID, "claude:claude-sonnet-5-5");
      setSetting(AGENT_SETTING.IMAGE_MODE_MODEL_ID, "web:gemini");

      expect(getSetting(AGENT_SETTING.DESIGN_MODEL_ID)).toBe("claude:claude-sonnet-5-5");
      expect(getSetting(AGENT_SETTING.IMAGE_MODE_MODEL_ID)).toBe("web:gemini");

      // Defaults fall back appropriately
      expect(DEFAULT_DESIGN_MODEL).toBe("antigravity:gemini-3.8-flash-high");
      expect(DEFAULT_IMAGE_MODEL).toBe("web:chatgpt");
    });
  });

  describe("3. Extension Detection & Protocol Compatibility", () => {
    it("does not falsely flag extension as outdated due to App/Extension version stream difference", () => {
      // App is 1.0.0-beta.3 while Extension is 0.1.0
      expect(isExtensionCompatible("0.1.0")).toBe(true);
      expect(isExtensionCompatible("0.1.1")).toBe(true);
      expect(isExtensionCompatible("1.0.0")).toBe(true);
      // Only legacy versions prior to 0.1.0 are incompatible
      expect(isExtensionCompatible("0.0.9")).toBe(false);
    });

    it("probes extension status and handles missing/ready/unreachable gracefully", async () => {
      // In Node test environment without browser extension runtime, probe returns missing or unreachable
      const res = await probeExtensionStatus(100);
      expect(res).toHaveProperty("status");
      expect([
        EXTENSION_STATUS.MISSING,
        EXTENSION_STATUS.UNREACHABLE,
        EXTENSION_STATUS.OUTDATED,
        EXTENSION_STATUS.READY,
        EXTENSION_STATUS.UNKNOWN,
      ]).toContain(res.status);
    });
  });

  describe("4. Centered Extension Dialog", () => {
    it("renders centered modal with setup guide and cancel/retry actions", () => {
      const markup = renderToStaticMarkup(
        <AgentExtensionDialog
          isOpen={true}
          status={EXTENSION_STATUS.MISSING}
          route="chatgpt"
          onClose={() => {}}
          onRetry={() => {}}
          t={(k) => k}
        />,
      );

      // Centered layout
      expect(markup).toContain("fixed inset-0 z-[100] flex items-center justify-center");
      // Setup guide
      expect(markup).toContain("chrome://extensions");
      expect(markup).toContain("extension/");
      // Actions
      expect(markup).toContain("agent-ext-retry");
      expect(markup).toContain("agent-ext-cancel");
    });
  });

  describe("5. Bottom-Left Mode Tabs UI in Agent Composer", () => {
    it("renders design and image mode tabs adjacent to the Plus attachment button", () => {
      const markup = renderToStaticMarkup(
        <AgentPanelView
          t={(k) => k}
          activeTitle="Test Session"
          historyOpen={false}
          setHistoryOpen={() => {}}
          setModelMenuOpen={() => {}}
          startNewSession={() => {}}
          onClose={() => {}}
          modelMenuOpen={false}
          modelGroups={availableModelGroups([], "design")}
          currentModel={DEFAULT_DESIGN_MODEL}
          handleSelectModel={() => {}}
          sessions={[]}
          activeId="test-1"
          openSession={() => {}}
          removeSession={() => {}}
          isEmpty={true}
          setInput={() => {}}
          transcript={[]}
          directions={[]}
          directionChoice={{ current: null }}
          busy={false}
          pipelineProgress={null}
          streamingText=""
          candidates={[]}
          keepCandidate={() => {}}
          activeContext={null}
          setActiveContext={() => {}}
          cancelled={false}
          lastRequest={null}
          send={() => {}}
          error={null}
          configError={false}
          onSubmit={() => {}}
          input="My draft text"
          onKeyDown={() => {}}
          turnRef={{ current: null }}
          references={{ attachments: [], isReading: false, addFiles: () => {}, removeAttachment: () => {} }}
          reasoningEfforts={[]}
          reasoningEffort=""
          onSelectReasoningEffort={() => {}}
          mode="design"
          onModeChange={() => {}}
          onCloseExtensionDialog={() => {}}
          onRetryExtension={() => {}}
        />,
      );

      // Check Plus button presence
      expect(markup).toContain("data-testid=\"agent-composer-add-attachment\"");
      // Check Mode tabs presence
      expect(markup).toContain("data-testid=\"agent-mode-tabs\"");
      expect(markup).toContain("data-testid=\"agent-mode-design\"");
      expect(markup).toContain("data-testid=\"agent-mode-image\"");
      // Check input text retention
      expect(markup).toContain("My draft text");
    });
  });

  describe("6. Anti-Late-Replacement Guard & Atomic History", () => {
    it("updates target layer in-place when target layer ID and image ID match", async () => {
      const mockNode = {
        id: "layer-123",
        imageId: "img-abc",
        src: "old.png",
        fill: "old.png",
        width: 200,
        height: 200,
      };

      const committed = [];
      const updated = [];
      const mockEditor = {
        getNode: (id) => (id === "layer-123" ? mockNode : null),
        getDocument: () => ({ nodes: [mockNode] }),
        updateNode: (id, patch) => {
          updated.push({ id, patch });
          Object.assign(mockNode, patch);
        },
        commitEditorDocument: (options) => {
          committed.push(options);
        },
      };

      const result = await applySafeImageResult(mockEditor, {
        targetLayerId: "layer-123",
        targetImageId: "img-abc",
        imageUrl: "new.png",
        imageId: "img-new",
      });

      expect(result.ok).toBe(true);
      expect(result.action).toBe("replaced");
      expect(result.layerId).toBe("layer-123");
      expect(mockNode.src).toBe("new.png");
      expect(mockNode.imageId).toBe("img-new");
      expect(committed.length).toBe(1);
      expect(committed[0].message).toBe("AI: Regenerate image");
    });

    it("safely inserts a new layer instead of overwriting when target layer was deleted or modified", async () => {
      const inserted = [];
      const committed = [];
      const mockEditor = {
        getNode: () => null, // target layer was deleted while generating!
        getDocument: () => ({ nodes: [] }),
        insertImage: async (url, point) => {
          const newNode = { id: "layer-brand-new", src: url, x: 0, y: 0 };
          inserted.push({ newNode, point });
          return newNode;
        },
        updateNode: () => {},
        commitEditorDocument: (options) => {
          committed.push(options);
        },
      };

      const result = await applySafeImageResult(mockEditor, {
        targetLayerId: "layer-123-deleted",
        targetImageId: "img-abc",
        imageUrl: "generated-asset.png",
      });

      expect(result.ok).toBe(true);
      expect(result.action).toBe("inserted");
      expect(result.layerId).toBe("layer-brand-new");
      expect(inserted.length).toBe(1);
      expect(inserted[0].newNode.src).toBe("generated-asset.png");
      expect(committed.length).toBe(1);
      expect(committed[0].message).toContain("AI: Insert image");
    });
  });
});
