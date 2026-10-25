import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SelectedNodeActions from "../../src/canvas/components/editor_properties/selected_node_actions.jsx";
import ImageContextActions from "../../src/canvas/components/editor_properties/image_context_actions.jsx";
import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

describe("secondary editor bars", () => {
  it("does not mount either removed bar from its former hosts", () => {
    const editor = readFileSync("src/canvas/components/image_editor.jsx", "utf8");
    const page = readFileSync("src/canvas/components/editor_page.jsx", "utf8");
    expect(editor).not.toContain("EditorToolSubbar");
    expect(editor).not.toContain("editor-tool-subbar");
    expect(page).not.toContain("EditorContextualTaskBar");
    expect(page).not.toContain("editor-contextual-taskbar");
    expect(page).not.toContain("editor-page-toolbar");
  });

  it("shows common selected-layer actions in the right-panel section", () => {
    const markup = renderToStaticMarkup(
      <SelectedNodeActions
        object={{ id: "image-1", kind: "image" }}
        engine={{}}
      />,
    );
    for (const id of [
      "duplicate",
      "lock",
      "hide",
      "bringForward",
      "sendBackward",
      "delete",
      "ai-sparkle",
    ]) {
      expect(markup).toContain(`data-testid="editor-taskbar-${id}"`);
    }
  });

  it("keeps image crop, replace, and background removal in image properties", () => {
    const markup = renderToStaticMarkup(
      <ImageContextActions
        object={{ id: "image-1", kind: "image" }}
        engine={{}}
        editAndCommit={vi.fn()}
        onRemoveBackground={vi.fn()}
        aiActions={{ onOutpaint: vi.fn(), onUpscale: vi.fn() }}
      />,
    );
    expect(markup).toContain("editor.taskbar.crop");
    expect(markup).toContain("editor.taskbar.replace");
    expect(markup).toContain("editor.taskbar.matting");
    expect(markup).toContain('data-testid="editor-taskbar-crop"');
    expect(markup).toContain('data-testid="editor-taskbar-replace"');
    expect(markup).toContain('data-testid="editor-taskbar-ai-remove-bg"');
    // AI actions live inside the collapsed "AI tools" disclosure.
    const aiTools = markup.match(
      /<details[^>]*data-testid="editor-taskbar-ai-tools"[^>]*>[\s\S]*?<\/details>/,
    )?.[0];
    expect(aiTools).toBeDefined();
    expect(aiTools).toContain("editor.taskbar.aiTools");
    expect(aiTools).toContain('data-testid="editor-taskbar-more"');
    expect(aiTools).toContain("editor.upscale.2x");
    expect(aiTools).toContain("editor.taskbar.outpaint");
  });

  it("keeps AI tools collapsed by default for an image", () => {
    const markup = renderToStaticMarkup(
      <ImageContextActions
        object={{ id: "image-1", kind: "image" }}
        engine={{}}
        editAndCommit={vi.fn()}
        aiActions={{ onOutpaint: vi.fn(), onUpscale: vi.fn() }}
      />,
    );
    const openTag = markup.match(
      /<details[^>]*data-testid="editor-taskbar-ai-tools"[^>]*>/,
    )?.[0];
    expect(openTag).toBeDefined();
    expect(openTag).not.toMatch(/\sopen(\s|>|=)/);
  });

  it("places the page delete action in the background properties panel", () => {
    const markup = renderToStaticMarkup(
      <EditorProperties isBackground onDeleteCanvas={vi.fn()} />,
    );
    expect(markup).toContain('data-testid="editor-delete-canvas-btn"');
  });
});
