// Frame ungroup placement, puppet pin list and the canvas CSS-size guard.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import SelectedNodeActions from "../../src/canvas/components/editor_properties/selected_node_actions.jsx";
import WarpSection from "../../src/canvas/components/editor_properties/warp_section.jsx";
import { syncCanvasCssSize } from "../../src/canvas/editor/skia_host.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

const rect = { id: "r1", kind: "rect", x: 0, y: 0, width: 10, height: 10 };
const engine = { canCombineSelection: () => false, ungroupSelection: () => {} };

describe("layer actions", () => {
  it("hides Ungroup for a frame", () => {
    const html = renderToStaticMarkup(
      <SelectedNodeActions
        object={{ ...rect, id: "f1", kind: "group", isFrame: true }}
        selectedNodes={[]}
        engine={engine}
      />,
    );
    expect(html).toBe("");
  });

  it("keeps Ungroup for a plain group", () => {
    const html = renderToStaticMarkup(
      <SelectedNodeActions
        object={{ ...rect, id: "g1", kind: "group" }}
        selectedNodes={[]}
        engine={engine}
      />,
    );
    expect(html).toContain("editor-taskbar-ungroup");
  });
});

describe("puppet pins", () => {
  it("lists pins with delete buttons and marks the fixed pin", () => {
    const html = renderToStaticMarkup(
      <WarpSection
        tool={TOOL.PUPPET_WARP}
        object={rect}
        edit={() => {}}
        editAndCommit={() => {}}
        onReset={() => {}}
        puppetPins={[
          { id: "p1", x: 0.2, y: 0.2 },
          { id: "p2", x: 0.8, y: 0.8, fixed: true },
        ]}
        puppetPinId="p1"
        onSelectPuppetPin={() => {}}
        onDeletePuppetPin={() => {}}
      />,
    );
    expect(html).toContain("editor.puppet.pins");
    expect(html).toContain("editor.puppet.pinLabel");
    expect(html).toContain("editor.puppet.deletePin");
    expect(html).toContain("editor.puppet.fixed");
  });
});

describe("canvas CSS size", () => {
  it("writes the stage size even when the backing store is unchanged", () => {
    const canvas = { style: { width: "100px", height: "100px" } };
    syncCanvasCssSize(canvas, 640.4, 480.6);
    expect(canvas.style).toMatchObject({ width: "640px", height: "481px" });
  });
});
