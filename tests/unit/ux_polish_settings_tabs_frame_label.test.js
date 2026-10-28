import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SETTINGS_TABS } from "../../src/canvas/components/settings_tabs.js";
import { FRAME_TITLE_HIT_AREA } from "../../src/canvas/components/editor_page_title.jsx";
import en from "../../src/shared/i18n/design-systems-en.js";
import zh from "../../src/shared/i18n/design-systems-zh.js";

describe("settings tabs", () => {
  it("gives every tab a distinct icon", () => {
    const icons = SETTINGS_TABS.map((tab) => tab.icon);
    icons.forEach((icon) => expect(icon).toBeTruthy());
    expect(new Set(icons).size).toBe(SETTINGS_TABS.length);
  });

  it("labels every tab through an i18n key present in en and zh, with no inline text", () => {
    for (const tab of SETTINGS_TABS) {
      expect(tab.labelZh).toBeUndefined();
      expect(tab.labelEn).toBeUndefined();
      expect(typeof tab.labelKey).toBe("string");
      expect(en[tab.labelKey]?.trim()).toBeTruthy();
      expect(zh[tab.labelKey]?.trim()).toBeTruthy();
    }
  });

  it("keeps the previous label texts", () => {
    const byId = Object.fromEntries(SETTINGS_TABS.map((tab) => [tab.id, tab.labelKey]));
    expect([en[byId.general], zh[byId.general]]).toEqual(["General", "常规偏好"]);
    expect([en[byId.assistant], zh[byId.assistant]]).toEqual(["AI Assistant", "AI 助手"]);
    expect([en[byId.providers], zh[byId.providers]]).toEqual(["AI Providers", "AI 供应商"]);
    expect([en[byId.shortcuts], zh[byId.shortcuts]]).toEqual(["Shortcuts", "快捷键速查"]);
  });
});

describe("frame name tag hit area", () => {
  it("pads the header to >= 24px and cancels it with a negative margin", () => {
    expect(FRAME_TITLE_HIT_AREA).toContain("py-1.5");
    expect(FRAME_TITLE_HIT_AREA).toContain("-my-1.5");
  });

  it("applies the class to page headers and canvas-root frame labels", () => {
    const src = readFileSync("src/canvas/components/editor_page.jsx", "utf8");
    expect(src.match(/\$\{FRAME_TITLE_HIT_AREA\}/g)).toHaveLength(3);
  });
});
