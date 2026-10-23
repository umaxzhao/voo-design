import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mock i18n
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({
    t: (key) => key,
    locale: "zh",
  }),
}));

import {
  UPSCALE_MODELS,
  resolveUpscaleModel,
} from "../../src/canvas/editor/upscale_models.js";
import EditorUpscaleButton from "../../src/canvas/components/editor_upscale_button.jsx";
import EditorContextualTaskBar from "../../src/canvas/components/editor_contextual_taskbar.jsx";

describe("HD Upscale Models & Taskbar Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Tier 1: Super Resolution Models Registry", () => {
    it("includes 2X, 4X, and Anime illustration models", () => {
      const ids = UPSCALE_MODELS.map((m) => m.id);
      expect(ids).toContain("realesrgan-compact-2x");
      expect(ids).toContain("realesrgan-compact-4x");
      expect(ids).toContain("realesrgan-anime-4x");
    });

    it("resolves model by numeric scale, string id, or options object", () => {
      expect(resolveUpscaleModel(2).id).toBe("realesrgan-compact-2x");
      expect(resolveUpscaleModel(4).id).toBe("realesrgan-compact-4x");
      expect(resolveUpscaleModel("realesrgan-anime-4x").id).toBe(
        "realesrgan-anime-4x"
      );
      expect(
        resolveUpscaleModel({ scale: 4, modelId: "realesrgan-anime-4x" }).id
      ).toBe("realesrgan-anime-4x");
      expect(resolveUpscaleModel(999).id).toBe("realesrgan-compact-2x");
    });
  });

  describe("Tier 2: EditorUpscaleButton Component", () => {
    it("renders upscale button with accessible aria-label", () => {
      const html = renderToStaticMarkup(
        <EditorUpscaleButton onUpscale={vi.fn()} busy={false} />
      );
      expect(html).toContain("aria-label=\"editor.upscale.button\"");
      expect(html).toContain("svg");
    });

    it("disables button when busy is true", () => {
      const html = renderToStaticMarkup(
        <EditorUpscaleButton onUpscale={vi.fn()} busy={true} />
      );
      expect(html).toContain("disabled=\"\"");
      expect(html).toContain("animate-pulse");
    });
  });

  describe("Tier 3: Contextual TaskBar Integration (compact face + More)", () => {
    it("keeps remove-bg on the face and parks HD upscale under More for single image", () => {
      const dummyEngine = {
        getSelected: () => ({ id: "img-1", kind: "image" }),
        getDocument: () => ({
          nodes: [{ id: "img-1", kind: "image", width: 400, height: 300 }],
        }),
      };

      const html = renderToStaticMarkup(
        <EditorContextualTaskBar
          engine={dummyEngine}
          selected={{ id: "img-1", kind: "image" }}
          hasSelection={false}
          removeBackground={vi.fn()}
          onUpscale={vi.fn()}
        />
      );

      // Compact face: matting + more (upscale lives inside the More AI menu)
      expect(html).toContain("editor.taskbar.matting");
      expect(html).toContain('data-testid="editor-taskbar-more"');
      expect(html).toContain('data-testid="editor-taskbar-ai-remove-bg"');
      expect(html).not.toContain("editor.upscale.button");

      const menu = renderToStaticMarkup(
        <EditorUpscaleButton onUpscale={vi.fn()} busy={false} />
      );
      expect(menu).toContain("editor.upscale.button");
    });
  });
});
