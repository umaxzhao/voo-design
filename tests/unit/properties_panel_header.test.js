import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PropertiesPanelHeader, { activateMaskAction } from "../../src/canvas/components/editor_properties/properties_panel_header.jsx";

describe("PropertiesPanelHeader mask action", () => {
  it("edits an existing mask instead of creating another", () => {
    const maskActions = { onAddMask: vi.fn(), onEditToggle: vi.fn() };

    activateMaskAction(true, maskActions);

    expect(maskActions.onEditToggle).toHaveBeenCalledOnce();
    expect(maskActions.onAddMask).not.toHaveBeenCalled();
  });

  it("keeps the create path when no mask exists", () => {
    const maskActions = { onAddMask: vi.fn(), onEditToggle: vi.fn() };

    activateMaskAction(false, maskActions);

    expect(maskActions.onAddMask).toHaveBeenCalledOnce();
    expect(maskActions.onEditToggle).not.toHaveBeenCalled();
  });
});

it.each([{ kind: "frame" }, { kind: "group", isFrame: true }])("omits redundant frame type and dimensions for $kind headers", (frame) => {
  const html = renderToStaticMarkup(React.createElement(PropertiesPanelHeader, {
    object: { ...frame, id: "frame", name: "Hero", width: 1200, height: 800 },
    selectionCount: 1,
    t: (key) => key,
  }));
  expect(html).toContain("Hero");
  expect(html).not.toContain("editor.nodeType.frame");
  expect(html).not.toContain("editor.props.size");
  expect(html).not.toContain("1200");
  expect(html).not.toContain("800");
});
