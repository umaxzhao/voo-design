import { describe, expect, it, vi } from "vitest";
import {
  createExportPreset,
  normalizeExportPresets,
  MAX_PRESETS,
} from "../../src/canvas/components/editor_properties/export-presets.js";

const persisted = [
  {
    id: "preset-1",
    type: "image/png",
    scale: 2,
    suffix: "封面✓",
    transparent: false,
  },
  { id: "preset-2", type: "image/jpeg", scale: 1, suffix: "", quality: "0.6" },
];

describe("persisted export preset identities", () => {
  it("allocates a free row ID after a fresh module loads persisted rows", async () => {
    vi.resetModules();
    const cold =
      await import("../../src/canvas/components/editor_properties/export-presets.js");
    const rows = cold.normalizeExportPresets(
      JSON.parse(JSON.stringify(persisted)),
    );
    const added = cold.createExportPreset({}, rows);
    expect(new Set([...rows, added].map((row) => row.id)).size).toBe(3);
    expect(rows.map((row) => row.id)).toEqual(["preset-1", "preset-2"]);
    expect(added).toMatchObject({ type: "image/png", scale: 1, suffix: "" });
  });

  it("repairs duplicate and missing IDs deterministically without losing valid rows", () => {
    const raw = [
      persisted[0],
      { ...persisted[0], suffix: "duplicate" },
      { type: "image/webp", scale: 3, suffix: "图像" },
      persisted[1],
    ];
    const untouched = JSON.parse(JSON.stringify(raw));
    const first = normalizeExportPresets(raw);
    expect(first).toHaveLength(MAX_PRESETS);
    expect(new Set(first.map((row) => row.id)).size).toBe(MAX_PRESETS);
    expect(first.map((row) => row.suffix)).toEqual([
      "封面✓",
      "duplicate",
      "图像",
      "",
    ]);
    expect(first[3].id).toBe("preset-2");
    expect(normalizeExportPresets(raw)).toEqual(first);
    expect(normalizeExportPresets(first)).toEqual(first);
    expect(raw).toEqual(untouched);
  });

  it("keeps effective fields and four valid rows when malformed entries precede them", () => {
    const raw = [
      null,
      false,
      ...persisted,
      {
        id: "third",
        type: "image/webp",
        scale: 3,
        suffix: "c",
        quality: "0.8",
      },
      { id: "fourth", type: "image/png", scale: 1, suffix: "" },
    ];
    const rows = normalizeExportPresets(raw);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject(persisted[0]);
    expect(rows[1]).toMatchObject(persisted[1]);
    expect(rows[2]).toMatchObject({ type: "image/webp", quality: "0.8" });
  });

  it("avoids a colliding requested identity and retains a free explicit one", () => {
    expect(
      createExportPreset({ id: "preset-1", suffix: "copy" }, persisted).id,
    ).not.toBe("preset-1");
    expect(
      createExportPreset({ id: "custom-id", suffix: "copy" }, persisted).id,
    ).toBe("custom-id");
  });
});
