import { describe, expect, it } from "vitest";
import en from "../../src/shared/i18n/en.js";
import zh from "../../src/shared/i18n/zh.js";

// Keys referenced by t("...") literals in the editor properties panels
// (selected_node_actions.jsx, tool_family_modes.jsx, image_context_actions.jsx),
// plus the dynamic adjust labels built from `editor.adjust.${kind}`.
const PROPERTIES_PANEL_KEYS = [
  "editor.layer.title",
  "editor.component.create",
  "editor.component.detach",
  "editor.context.image",
  "editor.frequencySeparation.action",
  "editor.frequencySeparation.radius",
  "editor.image.fill",
  "editor.image.fit",
  "editor.image.fitFill",
  "editor.taskbar.adjust",
  "editor.taskbar.crop",
  "editor.taskbar.group",
  "editor.taskbar.replace",
  "editor.taskbar.ungroup",
  "editor.toolOptions",
  "editor.adjust.brightness",
  "editor.adjust.contrast",
];

describe("editor properties panel translations", () => {
  it.each(PROPERTIES_PANEL_KEYS)(
    "provides a non-empty English and Chinese string for %s",
    (key) => {
      expect(typeof en[key]).toBe("string");
      expect(en[key].trim()).not.toBe("");
      expect(typeof zh[key]).toBe("string");
      expect(zh[key].trim()).not.toBe("");
    },
  );
});
