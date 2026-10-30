import { describe, expect, it } from "vitest";
import en from "../../src/shared/i18n/en.js";
import zh from "../../src/shared/i18n/zh.js";

// Keys referenced by t("...") in the properties panels that were previously
// missing from every locale file, so the panel showed raw key strings.
// Sources: gradient_properties.jsx (fill tool), brush_properties.jsx,
// align_section.jsx, shape_properties.jsx, properties_panel_header.jsx.
const FIXED_PROPERTIES_KEYS = [
  "editor.fill.contiguous",
  "editor.fill.sampleAll",
  "editor.fill.tolerance",
  "editor.brushMode.strength",
  "editor.brushMode.exposure",
  "editor.props.align.gap",
  "editor.props.distributeSpacingH",
  "editor.props.distributeSpacingV",
  "editor.strokeStyle.solid",
  "editor.strokeStyle.dashed",
  "editor.strokeStyle.joinMiter",
  "editor.strokeStyle.joinRound",
  "editor.strokeStyle.joinBevel",
  "editor.strokeStyle.capButt",
  "editor.strokeStyle.capRound",
  "editor.strokeStyle.capSquare",
  "editor.strokeStyle.dashSolid",
  "editor.strokeStyle.dashDashed",
  "editor.strokeStyle.dashDotted",
  "editor.strokeStyle.dashCustom",
  "editor.tool.selection",
];

describe("properties panel missing translation keys", () => {
  it.each(FIXED_PROPERTIES_KEYS)(
    "provides a non-empty English and Chinese string for %s",
    (key) => {
      expect(typeof en[key]).toBe("string");
      expect(en[key].trim()).not.toBe("");
      expect(typeof zh[key]).toBe("string");
      expect(zh[key].trim()).not.toBe("");
    },
  );
});
