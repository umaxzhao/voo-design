import { describe, expect, it } from "vitest";
import en from "../../src/shared/i18n/extended-en.js";
import zh from "../../src/shared/i18n/extended-zh.js";

describe("export dialog translations", () => {
  it.each([
    "editor.exportRange.pageFrame",
    "editor.exportScale",
    "editor.exportTransparentBackground",
    "editor.exportJpegOpaqueBackground",
  ])("provides English and Chinese for %s", (key) => {
    expect(en[key]).toBeTruthy();
    expect(en[key]).not.toMatch(/[\u4e00-\u9fff]/);
    expect(zh[key]).toMatch(/[\u4e00-\u9fff]/);
  });
});
