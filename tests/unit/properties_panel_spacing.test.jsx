import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ExportSection from "../../src/canvas/components/editor_properties/export_section.jsx";
import { CollapsibleSection } from "../../src/canvas/components/editor_properties/property_section.jsx";
import {
  loadEditorPanelSectionState,
  toggleEditorPanelSectionState,
} from "../../src/canvas/components/editor_panel_preferences.js";
import { PROPERTIES_PANEL_CONTENT_CLASS } from "../../src/canvas/components/editor_properties/index.jsx";

describe("properties panel spacing and sections", () => {
  it("renders module bodies directly, with no fold toggle", () => {
    const html = renderToStaticMarkup(
      <CollapsibleSection title="Fill">Fill controls</CollapsibleSection>,
    );
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain('type="button"');
    expect(html).toContain("Fill controls");
  });

  it("toggles and persists a section fold through editor panel preferences", () => {
    const key = `test.${Date.now()}`;
    expect(toggleEditorPanelSectionState(key, true)).toBe(false);
    expect(loadEditorPanelSectionState()[key]).toBe(false);
    expect(toggleEditorPanelSectionState(key, false)).toBe(true);
    expect(loadEditorPanelSectionState()[key]).toBe(true);
  });

  it("ignores a previously persisted collapsed state so no module hides its settings", () => {
    const key = `test.restore.${Date.now()}`;
    toggleEditorPanelSectionState(key, true);
    const html = renderToStaticMarkup(
      <CollapsibleSection title="Stroke" storageKey={key}>Stroke controls</CollapsibleSection>,
    );
    expect(html).toContain("Stroke controls");
    expect(html).not.toContain("aria-expanded");
  });

  it("renders the real opt-in Export heading without a fixed action", () => {
    const html = renderToStaticMarkup(
      <ExportSection object={{ id: "shape" }} engine={{ exportSelectionPng: () => {} }} />,
    );
    expect(html).not.toContain('data-testid="properties-export-action"');
    expect(html).toContain('data-testid="inspector-export-section"');
    expect(html.match(/<button/gu)).toHaveLength(1);
  });

  it("keeps the panel body scrollable inside its flex container", () => {
    expect(PROPERTIES_PANEL_CONTENT_CLASS).toContain("min-h-0");
    expect(PROPERTIES_PANEL_CONTENT_CLASS).toContain("overflow-y-auto");
  });
});
