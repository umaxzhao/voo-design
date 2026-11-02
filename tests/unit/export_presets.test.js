// Export presets live on the node, so normalize must tolerate old/absent data.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ExportSection, { normalizeExportPresets } from "../../src/canvas/components/editor_properties/export_section.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: (key) => key }) }));

describe("export preset normalization", () => {
  it.each([undefined, null, [], [null, false, "invalid"]])("keeps unconfigured export presets empty: %j", (raw) => {
    expect(normalizeExportPresets(raw)).toEqual([]);
  });

  it.each([undefined, []])("shows only the add entry without configured exports: %j", (exportPresets) => {
    const html = renderToStaticMarkup(React.createElement(ExportSection, {
      object: { id: "unconfigured", exportPresets },
      engine: { exportSelectionPng: () => null },
    }));
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain('type="checkbox"');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="editor.props.exportFormat"');
    expect(html).toContain('aria-label="editor.props.addExportSettings"');
  });

  it("sanitizes unknown formats/scales and caps the row count", () => {
    const rows = normalizeExportPresets([
      { id: "a", type: "image/gif", scale: 9, suffix: "x" },
      { id: "b", type: "image/webp", scale: 2, suffix: "s", transparent: false },
      { id: "c", type: "image/jpeg", scale: 3, quality: "0.8" },
      { id: "d", type: "image/png", scale: 1 },
      { id: "e", type: "image/png", scale: 1 },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ id: "a", type: "image/png", scale: 1 });
    expect(rows[1]).toMatchObject({ id: "b", transparent: false });
    expect(rows[2]).toMatchObject({ id: "c", quality: "0.8" });
  });
});
