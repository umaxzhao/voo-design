// @vitest-environment node
import { describe, it, expect } from "vitest";
import { LIVE_FILTER_KINDS } from "../../src/canvas/editor/live_filter_stack.js";
import enStrings from "../../src/shared/i18n/extended-en.js";
import zhStrings from "../../src/shared/i18n/extended-zh.js";

describe("live filter i18n", () => {
  for (const [locale, strings] of [["en", enStrings], ["zh", zhStrings]]) {
    it.each(LIVE_FILTER_KINDS)(`has a non-empty ${locale} label for %s`, (kind) => {
      const key = `editor.liveFilter.kind.${kind}`;
      expect(strings, key).toHaveProperty(key);
      expect(typeof strings[key], key).toBe("string");
      expect(strings[key].trim(), key).not.toBe("");
    });
  }
});
