// Export presets live on the node, so normalize must tolerate old/absent data.
import { describe, expect, it } from "vitest";
import { normalizeExportPresets } from "../../src/canvas/components/editor_properties/export_section.jsx";

describe("export preset normalization", () => {
  it("falls back to one PNG preset", () => {
    const rows = normalizeExportPresets(undefined);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "image/png", scale: 1, suffix: "" });
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
