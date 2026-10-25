// Polyfill window & Element for Node environment (must precede imports)
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({
    t: (key) => key,
    locale: "en",
    toggleLocale: () => {},
  }),
}));

import EditorProperties, {
  PropertiesPanelSections,
  LiveFilterSection,
} from "../../src/canvas/components/editor_properties/index.jsx";
import { resolvePanelForContext } from "../../src/canvas/components/editor_properties/resolve_panel_context.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";
import LiveFilterStack from "../../src/canvas/components/editor_properties/live_filter_stack.jsx";
import {
  LiveFilterPicker,
  addLiveFilter,
} from "../../src/canvas/components/editor_properties/live_filter_section.jsx";
import {
  LIVE_FILTER_KINDS,
  createLiveFilterEntry,
} from "../../src/canvas/editor/live_filter_stack.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";

const resolve = (kind, tool = TOOL.SELECT, extra = {}) =>
  resolvePanelForContext({ tool, selection: [{ id: "node-1", kind, ...extra }] });

describe("LiveFilterSection mounting in properties panel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps an unused Live Filter section out of the panel and reaches it through the add menu", () => {
    const context = resolve("image");
    expect(context.panel).toBe("properties");
    expect(context.sections).toContain("effects");

    const imageNode = {
      id: "img-1",
      kind: "image",
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      adjustments: { liveFilters: [] },
    };

    const html = renderToStaticMarkup(
      <EditorProperties tool={TOOL.SELECT} object={imageNode} engine={{ getDocument: () => ({ nodes: [] }), subscribeRender: () => () => {} }} />,
    );

    // Image actions that used to sit in the top bar live in the panel.
    expect(html).toContain('data-testid="image-context-actions"');
    expect(html).not.toContain("image-context-toolbar");
    // Nothing is listed for an empty stack: no section, no stacked add buttons.
    expect(html).not.toContain('data-testid="editor-live-filter-section"');
    expect(html).not.toContain("editor.liveFilters.empty");
    expect(html).not.toContain("live-filter-add-");
    expect(html).toContain('data-testid="properties-add-menu"');
  });

  it("renders a revealed empty Live Filter section as a header with one add button", () => {
    const html = renderToStaticMarkup(
      <LiveFilterSection
        object={{ id: "img-r", kind: "image", adjustments: { liveFilters: [] } }}
        revealed
        defaultPickerOpen={false}
        edit={() => {}}
        editAndCommit={() => {}}
      />,
    );
    expect(html).toContain('data-testid="editor-live-filter-section"');
    expect(html.match(/aria-label="editor\.liveFilters\.add"/g)).toHaveLength(1);
    expect(html).not.toContain("live-filter-add-");
    expect(html).not.toContain("editor.liveFilters.empty");
  });

  it("offers every filter kind in one picker", () => {
    const html = renderToStaticMarkup(
      <LiveFilterSection
        object={{ id: "img-p", kind: "image", adjustments: { liveFilters: [] } }}
        engine={{}}
        revealed
        edit={() => {}}
        editAndCommit={() => {}}
      />,
    );
    expect(html.match(/data-testid="editor-live-filter-picker"/g)).toHaveLength(1);
    for (const kind of LIVE_FILTER_KINDS) {
      expect(html).toContain(`data-testid="live-filter-add-${kind}"`);
      expect(html).toContain(`editor.liveFilter.kind.${kind}`);
    }
    // Frequency separation belongs to the image actions, not the filter picker.
    expect(html).not.toContain("live-filter-add-frequency");
  });

  it("shows the Live Filter section for an image node that already has a filter", () => {
    const html = renderToStaticMarkup(
      <EditorProperties
        tool={TOOL.SELECT}
        object={{ id: "img-9", kind: "image", x: 0, y: 0, width: 10, height: 10, adjustments: { liveFilters: [createLiveFilterEntry("blur", { value: 20 })] } }}
      />,
    );
    expect(html).toContain('data-testid="editor-live-filter-section"');
    expect(html).toContain("editor.liveFilters.title");
    expect(html).toContain('data-testid="live-filter-entry-blur"');
  });

  it("includes the Live Filter section for a raster node with a filter", () => {
    const rasterNode = {
      id: "raster-1",
      kind: "raster",
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      adjustments: { liveFilters: [createLiveFilterEntry("sharpen", { value: 10 })] },
    };

    const html = renderToStaticMarkup(
      <PropertiesPanelSections
        object={rasterNode}
        sections={["effects"]}
        edit={() => {}}
        editAndCommit={() => {}}
        commitNow={() => {}}
        t={(key) => key}
      />,
    );

    expect(html).toContain('data-testid="editor-live-filter-section"');
    expect(html).toContain("editor.liveFilters.title");
  });

  it("renders active Live Filter stack entries and controls for an image node", () => {
    const blurEntry = createLiveFilterEntry("blur", { value: 35 });
    const motionEntry = createLiveFilterEntry("motionBlur", { value: 60, angle: 45 });
    const highPassEntry = createLiveFilterEntry("highPass", { radius: 20 });
    const imageNode = {
      id: "img-2",
      kind: "image",
      x: 10,
      y: 20,
      width: 400,
      height: 300,
      adjustments: { liveFilters: [blurEntry, motionEntry, highPassEntry] },
    };

    const html = renderToStaticMarkup(
      <PropertiesPanelSections
        object={imageNode}
        edit={() => {}}
        editAndCommit={() => {}}
        commitNow={() => {}}
        t={(key) => key}
      />,
    );

    expect(html).toContain('data-testid="editor-live-filter-section"');
    expect(html).toContain('data-testid="live-filter-entry-blur"');
    expect(html).toContain('data-testid="live-filter-entry-motionBlur"');
    expect(html).toContain('data-testid="live-filter-entry-highPass"');
    expect(html).toContain("editor.liveFilters.value");
    expect(html).toContain("editor.liveFilters.radius");
    expect(html).toContain("editor.liveFilters.angle");
    expect(html).toContain("editor.liveFilters.opacity");
    expect(html).toContain("editor.liveFilters.moveUp");
    expect(html).toContain("editor.liveFilters.moveDown");
    expect(html).toContain("editor.liveFilters.remove");
  });

  it.each(["rect", "ellipse", "path", "text", "group", "video"])(
    "omits the Live Filter section for non-image %s nodes",
    (kind) => {
      const node = { id: `node-${kind}`, kind, x: 0, y: 0, width: 120, height: 80 };
      const html = renderToStaticMarkup(
        <EditorProperties tool={TOOL.SELECT} object={node} />,
      );
      expect(html).not.toContain('data-testid="editor-live-filter-section"');
      expect(html).not.toContain("editor.liveFilters.title");
    },
  );
});

describe("LiveFilterSection add, reorder, toggle, parameter edit and history", () => {
  const baseImageNode = {
    id: "img-actions",
    kind: "image",
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    adjustments: { liveFilters: [] },
  };

  it("adds any of the 8 LIVE_FILTER_KINDS from the single picker with editAndCommit", () => {
    for (const kind of LIVE_FILTER_KINDS) {
      const editAndCommit = vi.fn();
      const onPick = (picked) =>
        addLiveFilter({ object: baseImageNode, liveFilters: [], kind: picked, editAndCommit });
      const picker = LiveFilterPicker({ onPick });
      const btn = picker.props.children.find((b) => b.key === kind);
      expect(btn).toBeTruthy();
      btn.props.onClick();

      expect(editAndCommit).toHaveBeenCalledTimes(1);
      const stack = editAndCommit.mock.calls[0][0].adjustments.liveFilters;
      expect(stack).toHaveLength(1);
      expect(stack[0].kind).toBe(kind);
      expect(stack[0].enabled).toBe(true);
      if (kind === "motionBlur") expect(stack[0].params.angle).toBe(0);
    }
  });

  it("toggles filter enabled state and commits immediately", () => {
    const entry = createLiveFilterEntry("sharpen", { value: 40 });
    const editAndCommit = vi.fn();
    const section = LiveFilterStack({
      object: baseImageNode,
      liveFilters: [entry],
      edit: () => {},
      editAndCommit,
    });

    const toggleBtn = section.props.children[0].props.children[0].props.children[0];
    toggleBtn.props.onClick();

    expect(editAndCommit).toHaveBeenCalledTimes(1);
    const updated = editAndCommit.mock.calls[0][0].adjustments.liveFilters;
    expect(updated[0].enabled).toBe(false);
  });

  it("reorders filters up and down and respects bounds", () => {
    const [e1, e2, e3] = [
      createLiveFilterEntry("blur", { value: 10 }),
      createLiveFilterEntry("noise", { value: 20 }),
      createLiveFilterEntry("sepia", { value: 30 }),
    ];
    const editAndCommit = vi.fn();
    const section = LiveFilterStack({
      object: baseImageNode,
      liveFilters: [e1, e2, e3],
      edit: () => {},
      editAndCommit,
    });

    const entriesList = section.props.children;
    // Move e1 up (index 0) -> no-op
    entriesList[0].props.children[0].props.children[2].props.onClick();
    expect(editAndCommit).not.toHaveBeenCalled();

    // Move e2 down (index 1) -> e2 at index 2
    entriesList[1].props.children[0].props.children[3].props.onClick();
    expect(editAndCommit).toHaveBeenCalledWith({ adjustments: { liveFilters: [e1, e3, e2] } });

    // Move e2 up (index 1) -> e2 at index 0
    editAndCommit.mockClear();
    entriesList[1].props.children[0].props.children[2].props.onClick();
    expect(editAndCommit).toHaveBeenCalledWith({ adjustments: { liveFilters: [e2, e1, e3] } });
  });

  it("deletes a filter from the stack", () => {
    const [e1, e2] = [createLiveFilterEntry("blur", { value: 10 }), createLiveFilterEntry("clarity", { value: 20 })];
    const editAndCommit = vi.fn();
    const section = LiveFilterStack({
      object: baseImageNode,
      liveFilters: [e1, e2],
      edit: () => {},
      editAndCommit,
    });

    const removeBtn = section.props.children[0].props.children[0].props.children[4];
    removeBtn.props.onClick();
    expect(editAndCommit).toHaveBeenCalledWith({ adjustments: { liveFilters: [e2] } });
  });

  it("previews parameter edits in real time and commits on slider release", () => {
    const motion = createLiveFilterEntry("motionBlur", { value: 30, angle: 45 });
    const edit = vi.fn();
    const commitNow = vi.fn();
    const section = LiveFilterStack({
      object: baseImageNode,
      liveFilters: [motion],
      edit,
      editAndCommit: () => {},
      commitNow,
    });

    const [, valueSlider, angleSlider, opacitySlider] = section.props.children[0].props.children;

    // Value scrub & release
    valueSlider.props.onValueChange(80);
    expect(edit).toHaveBeenCalledWith({
      adjustments: { liveFilters: [expect.objectContaining({ id: motion.id, params: expect.objectContaining({ value: 80 }) })] },
    });
    valueSlider.props.onCommit();
    expect(commitNow).toHaveBeenCalledTimes(1);

    // Angle scrub & release
    angleSlider.props.onValueChange(180);
    expect(edit).toHaveBeenCalledWith({
      adjustments: { liveFilters: [expect.objectContaining({ id: motion.id, params: expect.objectContaining({ angle: 180 }) })] },
    });
    angleSlider.props.onCommit();
    expect(commitNow).toHaveBeenCalledTimes(2);

    // Opacity scrub & release (0-100% -> 0..1)
    opacitySlider.props.onValueChange(65);
    expect(edit).toHaveBeenCalledWith({
      adjustments: { liveFilters: [expect.objectContaining({ id: motion.id, opacity: 0.65 })] },
    });
    opacitySlider.props.onCommit();
    expect(commitNow).toHaveBeenCalledTimes(3);
  });

  it("adjusts radius parameter when present on filter entry", () => {
    const highPass = createLiveFilterEntry("highPass", { radius: 15 });
    const edit = vi.fn();
    const section = LiveFilterStack({
      object: baseImageNode,
      liveFilters: [highPass],
      edit,
      editAndCommit: () => {},
    });

    const radiusSlider = section.props.children[0].props.children[1];
    expect(radiusSlider.props.label).toBe("editor.liveFilters.radius");
    radiusSlider.props.onValueChange(42);
    expect(edit).toHaveBeenCalledWith({
      adjustments: { liveFilters: [expect.objectContaining({ id: highPass.id, params: expect.objectContaining({ radius: 42 }) })] },
    });
  });

  it("supports undo and redo of adjustments.liveFilters via document history", () => {
    const history = createHistory();
    const mkDoc = (liveFilters) => ({
      id: "doc-test",
      nodes: [{ id: "node-img", kind: "image", adjustments: { liveFilters } }],
    });

    const blur = createLiveFilterEntry("blur", { value: 25 });
    const motion = createLiveFilterEntry("motionBlur", { value: 50, angle: 90 });

    history.reset(mkDoc([]));
    history.push(mkDoc([blur]));
    history.push(mkDoc([{ ...blur, params: { value: 75 } }]));
    history.push(mkDoc([{ ...blur, params: { value: 75 }, enabled: false }]));
    history.push(mkDoc([motion, { ...blur, params: { value: 75 }, enabled: false }]));

    expect(history.canUndo()).toBe(true);

    // Undo step 4: motionBlur removed, blur restored
    const undo4 = history.undo();
    expect(undo4.nodes[0].adjustments.liveFilters).toHaveLength(1);
    expect(undo4.nodes[0].adjustments.liveFilters[0].kind).toBe("blur");
    expect(undo4.nodes[0].adjustments.liveFilters[0].enabled).toBe(false);

    // Undo step 3: enabled false reverted to true
    const undo3 = history.undo();
    expect(undo3.nodes[0].adjustments.liveFilters[0].enabled).toBe(true);
    expect(undo3.nodes[0].adjustments.liveFilters[0].params.value).toBe(75);

    // Undo step 2: value 75 reverted to 25
    const undo2 = history.undo();
    expect(undo2.nodes[0].adjustments.liveFilters[0].params.value).toBe(25);

    // Undo step 1: blur removed -> empty stack
    const undo1 = history.undo();
    expect(undo1.nodes[0].adjustments.liveFilters).toEqual([]);
    expect(history.canUndo()).toBe(false);

    // Redo step 1: blur added
    const redo1 = history.redo();
    expect(redo1.nodes[0].adjustments.liveFilters).toHaveLength(1);
    expect(redo1.nodes[0].adjustments.liveFilters[0].params.value).toBe(25);

    // Redo step 2: value changed to 75
    const redo2 = history.redo();
    expect(redo2.nodes[0].adjustments.liveFilters[0].params.value).toBe(75);

    // Redo step 3: enabled toggled to false
    const redo3 = history.redo();
    expect(redo3.nodes[0].adjustments.liveFilters[0].enabled).toBe(false);

    // Redo step 4: motionBlur + disabled blur
    const redo4 = history.redo();
    expect(redo4.nodes[0].adjustments.liveFilters).toHaveLength(2);
    expect(redo4.nodes[0].adjustments.liveFilters[0].kind).toBe("motionBlur");
    expect(redo4.nodes[0].adjustments.liveFilters[1].kind).toBe("blur");
    expect(history.canRedo()).toBe(false);
  });
});
