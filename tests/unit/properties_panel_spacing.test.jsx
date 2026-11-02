import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PropertiesExportAction from "../../src/canvas/components/editor_properties/properties_export_action.jsx";
import { CollapsibleSection } from "../../src/canvas/components/editor_properties/property_section.jsx";
import {
  loadEditorPanelSectionState,
  toggleEditorPanelSectionState,
} from "../../src/canvas/components/editor_panel_preferences.js";
import { PROPERTIES_PANEL_CONTENT_CLASS } from "../../src/canvas/components/editor_properties/index.jsx";

describe("properties panel spacing and sections", () => {
  it("renders sections expanded by default with a keyboard-operable button", () => {
    const html = renderToStaticMarkup(
      <CollapsibleSection title="Fill">Fill controls</CollapsibleSection>,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Fill controls");
  });

  it("toggles and persists a section fold through editor panel preferences", () => {
    const key = `test.${Date.now()}`;
    expect(toggleEditorPanelSectionState(key, true)).toBe(false);
    expect(loadEditorPanelSectionState()[key]).toBe(false);
    expect(toggleEditorPanelSectionState(key, false)).toBe(true);
    expect(loadEditorPanelSectionState()[key]).toBe(true);
  });

  it("restores a persisted collapsed state on the next render and expands again", () => {
    const key = `test.restore.${Date.now()}`;
    toggleEditorPanelSectionState(key, true);
    const collapsed = renderToStaticMarkup(
      <CollapsibleSection title="Stroke" storageKey={key}>Stroke controls</CollapsibleSection>,
    );
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).not.toContain("Stroke controls");
    toggleEditorPanelSectionState(key, false);
    const expanded = renderToStaticMarkup(
      <CollapsibleSection title="Stroke" storageKey={key}>Stroke controls</CollapsibleSection>,
    );
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).toContain("Stroke controls");
  });

  it("renders the fixed Export action once", () => {
    const html = renderToStaticMarkup(
      <PropertiesExportAction title="Export" label="Export PNG" onExport={() => {}} />,
    );
    expect(html.match(/data-testid="properties-export-action"/gu)).toHaveLength(1);
    expect(html.match(/<button/gu)).toHaveLength(1);
  });

  it("keeps the panel body scrollable inside its flex container", () => {
    expect(PROPERTIES_PANEL_CONTENT_CLASS).toContain("min-h-0");
    expect(PROPERTIES_PANEL_CONTENT_CLASS).toContain("overflow-y-auto");
  });
});
