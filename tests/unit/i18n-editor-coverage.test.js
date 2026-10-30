import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../src/shared/i18n/en.js";
import zh from "../../src/shared/i18n/zh.js";

const directory = new URL("../../src/canvas/components/editor_properties/", import.meta.url);
const labels = readdirSync(directory).filter(file => /\.jsx?$/.test(file)).flatMap(file => {
  const source = readFileSync(new URL(file, directory), "utf8");
  return [...source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map(match => ({ key: match[1], file }));
});

describe("inspector translation coverage", () => {
  it.each([["en", en], ["zh", zh]])("provides every literal panel label in %s", (_locale, dictionary) => {
    expect(labels.length).toBeGreaterThan(100);
    for (const { key, file } of labels) {
      expect(dictionary[key], `${file}: ${key}`).toBeTypeOf("string");
      expect(dictionary[key].trim(), `${file}: ${key}`).not.toBe("");
      expect(dictionary[key], `${file}: ${key}`).not.toBe(key);
    }
  });
});
