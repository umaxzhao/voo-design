import { describe, it, expect } from "vitest";
import fs from "node:fs";
import en from "../../src/shared/i18n/welcome-en.js";
import zh from "../../src/shared/i18n/welcome-zh.js";

describe("title bar i18n", () => {
  it("has no hardcoded CJK strings in app_title_bar.jsx", () => {
    const src = fs.readFileSync(new URL("../../src/app_title_bar.jsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/[\u4e00-\u9fff]/);
  });
  it("every titlebar key exists in en and zh, en is not Chinese", () => {
    const keys = Object.keys(zh).filter((k) => k.startsWith("titlebar."));
    expect(keys.length).toBeGreaterThan(5);
    for (const k of keys) {
      expect(en[k], k).toBeTruthy();
      expect(en[k]).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });
});
