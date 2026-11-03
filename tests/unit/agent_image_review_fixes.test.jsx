// Polyfill window for the Node test environment if absent (same as agent_design_image_modes).
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AgentExtensionDialog from "../../src/canvas/components/agent-panel/agent_extension_dialog.jsx";
import { EXTENSION_STATUS } from "../../src/canvas/agent/extension_detection.js";
import { applySafeImageResult } from "../../src/canvas/agent/image_replacement_guard.js";
import {
  splitImageModelId,
  hasSelectedImageReference,
} from "../../src/canvas/agent/image_model_route.js";
import { IMAGE_MODEL_GROUPS, isWebImageModel } from "../../src/canvas/components/agent-panel/model_catalog.js";
import { PROVIDER_ID } from "../../src/shared/providers.js";

describe("Agent image review fixes (C01 / C02 / C03 / C04)", () => {
  describe("C01: unknown extension status is not presented as missing", () => {
    it("renders the unclear label for UNKNOWN and never the missing label", () => {
      const markup = renderToStaticMarkup(
        <AgentExtensionDialog
          isOpen={true}
          status={EXTENSION_STATUS.UNKNOWN}
          route="chatgpt"
          onClose={() => {}}
          onRetry={() => {}}
          t={(k) => k}
        />,
      );
      expect(markup).toContain("agent.extension.statusUnknown");
      expect(markup).not.toContain("agent.extension.statusMissing");
    });
  });

  describe("C02: selected image model is split into explicit provider and model", () => {
    it("maps the composer 302 prefix to the registered 302ai provider id", () => {
      expect(splitImageModelId("302:qwen-image-3.0-pro")).toEqual({
        providerId: "302ai",
        modelId: "qwen-image-3.0-pro",
      });
    });

    it("splits a dashscope model id", () => {
      expect(splitImageModelId("dashscope:qwen-image-plus")).toEqual({
        providerId: "dashscope",
        modelId: "qwen-image-plus",
      });
    });

    it("every API image model in the composer catalog resolves to a registered provider id", () => {
      const registered = new Set(Object.values(PROVIDER_ID));
      const apiModelIds = IMAGE_MODEL_GROUPS.flatMap((group) => group.models.map((model) => model.id)).filter(
        (id) => !isWebImageModel(id),
      );
      expect(apiModelIds.length).toBeGreaterThan(0);
      for (const id of apiModelIds) {
        expect(registered.has(splitImageModelId(id).providerId), id).toBe(true);
      }
    });

    it("fails fast on a malformed model id instead of guessing a provider", () => {
      expect(() => splitImageModelId("qwen-only")).toThrow();
      expect(() => splitImageModelId(":model")).toThrow();
      expect(() => splitImageModelId("302:")).toThrow();
    });
  });

  describe("C03: web route detects an image reference in the selection", () => {
    it("reports true when the selected layer is an image", () => {
      expect(hasSelectedImageReference({ kind: "image", selection: [{ kind: "image" }] })).toBe(true);
    });

    it("reports true when any selected layer is an image", () => {
      expect(
        hasSelectedImageReference({ kind: "rect", selection: [{ kind: "rect" }, { kind: "image" }] }),
      ).toBe(true);
    });

    it("reports true for the real Regenerate context that carries referenceImage without a node kind", () => {
      expect(
        hasSelectedImageReference({
          type: "layer",
          layerId: "layer-1",
          name: "Image",
          referenceImage: { layerId: "layer-1", src: "data:image/png;base64,AA==" },
        }),
      ).toBe(true);
    });

    it("reports false without an image selection or context", () => {
      expect(hasSelectedImageReference({ kind: "rect", selection: [{ kind: "rect" }] })).toBe(false);
      expect(hasSelectedImageReference(null)).toBe(false);
    });
  });

  describe("C04: insert plus metadata is one engine operation", () => {
    function makeEngine() {
      const engineCommits = [];
      const directCommits = [];
      const engine = {
        getNode: () => null,
        getDocument: () => ({ nodes: [] }),
        prepareImageInsertion: async (url) => ({ imageId: "img-prepared", bitmap: {}, src: url }),
        insertPreparedImages: (entries, name) => {
          const node = { id: "layer-new", imageId: entries[0].prepared.imageId, width: 100, height: 100 };
          Object.assign(node, entries[0].patch);
          engineCommits.push(name);
          return [node];
        },
        commitEditorDocument: (options) => {
          directCommits.push(options?.message);
        },
      };
      return { engine, engineCommits, directCommits };
    }

    it("inserts the fallback layer with metadata in a single commit", async () => {
      const { engine, engineCommits, directCommits } = makeEngine();
      const result = await applySafeImageResult(engine, {
        targetLayerId: "layer-deleted",
        targetImageId: "img-old",
        imageUrl: "generated.png",
        imageId: "img-new",
        width: 200,
        height: 150,
        name: "Generated",
      });

      expect(result.ok).toBe(true);
      expect(result.action).toBe("inserted");
      expect(result.layerId).toBe("layer-new");
      expect(engineCommits).toEqual(["AI: Insert image (target modified or missing)"]);
      expect(directCommits).toEqual([]);
    });

    it("applies the metadata to the inserted node", async () => {
      const captured = [];
      const { engine } = makeEngine();
      const original = engine.insertPreparedImages;
      engine.insertPreparedImages = (entries, name) => {
        const nodes = original(entries, name);
        captured.push(nodes[0]);
        return nodes;
      };
      await applySafeImageResult(engine, {
        targetLayerId: "layer-deleted",
        targetImageId: "img-old",
        imageUrl: "generated.png",
        imageId: "img-new",
        width: 200,
        height: 150,
        name: "Generated",
      });

      expect(captured[0].imageId).toBe("img-new");
      expect(captured[0].width).toBe(200);
      expect(captured[0].height).toBe(150);
      expect(captured[0].name).toBe("Generated");
    });
  });
});
