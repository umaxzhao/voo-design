import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ImageContextActions from "../../src/canvas/components/editor_properties/image_context_actions.jsx";
import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import Quickbar from "../../src/canvas/components/editor_contextual_taskbar.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

describe("secondary editor bars", () => {
  it("does not mount the removed tool subbar and keeps the contextual bar in the page", () => {
    const editor = readFileSync("src/canvas/components/image_editor.jsx", "utf8");
    const page = readFileSync("src/canvas/components/editor_page.jsx", "utf8");
    expect(editor).not.toContain("EditorToolSubbar");
    expect(editor).not.toContain("editor-tool-subbar");
    // The contextual bar is restored at its two render sites via the slot.
    expect(page).toContain("EditorContextualTaskBarSlot");
    expect(page).not.toContain("editor-contextual-taskbar");
  });

  it("removes layer actions from the properties component", () => {
    const markup = renderToStaticMarkup(
      <EditorProperties tool="select" object={{ id: "image-1", kind: "image" }} engine={{}} />,
    );
    expect(markup).not.toContain('data-testid="editor-taskbar-layer-actions"');
    expect(markup).not.toContain('data-testid="editor-taskbar-ai-sparkle"');
    expect(markup).not.toContain("editor.taskbar.askAgent");
    const nodes = [
      { id: "a", kind: "rect", width: 40, height: 40 },
      { id: "b", kind: "rect", width: 40, height: 40 },
    ];
    const multiPanel = renderToStaticMarkup(<EditorProperties tool="select" object={nodes[0]} selectedNodes={nodes} selectionCount={2} onLayout={vi.fn()} onCombine={vi.fn()} engine={{ canCombineSelection: () => true }} />);
    for (const action of ["group", "ungroup", "boolean-union", "boolean-subtract", "boolean-intersect", "boolean-exclude"]) {
      expect(multiPanel).not.toContain(`data-testid="editor-taskbar-${action}"`);
    }
    expect(multiPanel).not.toContain("editor.props.combine");
    expect(multiPanel).not.toContain('aria-label="editor.props.alignShapes.left"');
    expect(multiPanel).toContain('aria-label="editor.props.align.gap"');
    const multiBar = renderToStaticMarkup(<Quickbar selected={nodes[0]} selectedIds={["a", "b"]} engine={{ canCombineSelection: () => true }} />);
    expect(multiBar).toContain('data-testid="editor-taskbar-alignment-menu"');
    expect(multiBar).toContain('data-testid="editor-taskbar-boolean-menu"');
    expect(multiBar).not.toContain('data-testid="editor-taskbar-align-left"');
    expect(multiBar).not.toContain('data-testid="editor-taskbar-boolean-union"');
    const bottomBar = renderToStaticMarkup(
      <Quickbar selected={{ id: "image-1", kind: "image" }} engine={{}} />,
    );
    for (const id of ["duplicate", "lock", "hide", "bringForward", "sendBackward", "delete"]) {
      expect(bottomBar).toContain(`data-testid="editor-taskbar-${id}"`);
    }
  });

  it("keeps crop and replace only in the bottom quickbar", () => {
    const markup = renderToStaticMarkup(
      <ImageContextActions
        object={{ id: "image-1", kind: "image" }}
        engine={{}}
        editAndCommit={vi.fn()}
      />,
    );
    expect(markup).not.toContain('data-testid="editor-taskbar-crop"');
    expect(markup).not.toContain('data-testid="editor-taskbar-replace"');
    expect(markup).toContain("editor.frequencySeparation.action");
    expect(markup).toContain("editor.image.fitFill");
    const bottomBar = renderToStaticMarkup(<Quickbar selected={{ id: "image-1", kind: "image" }} engine={{}} />);
    expect(bottomBar).toContain('data-testid="editor-taskbar-crop"');
    expect(bottomBar).toContain('data-testid="editor-taskbar-replace"');
    // Remove BG and the AI tools menu are on the bottom quick-tools bar only.
    expect(markup).not.toContain('data-testid="editor-taskbar-ai-remove-bg"');
    expect(markup).not.toContain("editor.taskbar.matting");
    expect(markup).not.toContain('data-testid="editor-taskbar-ai-tools"');
    expect(markup).not.toContain("editor.taskbar.aiTools");
  });

  it("places the page delete action in the background properties panel", () => {
    const markup = renderToStaticMarkup(
      <EditorProperties isBackground onDeleteCanvas={vi.fn()} />,
    );
    expect(markup).toContain('data-testid="editor-delete-canvas-btn"');
  });
});
