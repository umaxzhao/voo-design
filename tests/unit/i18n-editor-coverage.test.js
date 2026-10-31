import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import en from "../../src/shared/i18n/en.js";
import zh from "../../src/shared/i18n/zh.js";

/**
 * Every editor surface that renders translated copy.
 *
 * The previous version of this guard only scanned `editor_properties`, so a
 * missing key in a component, an agent tool or an editor module could ship as a
 * raw `editor.something` label and no test would notice. Scan the whole surface
 * instead: recursive, so new subdirectories are covered without editing the test.
 */
const SCAN_ROOTS = [
  "src/canvas/components",
  "src/canvas/agent",
  "src/canvas/editor",
];

/** (a) `t("literal.key")` / `t('literal.key')` — the common translate call. */
const LITERAL_TRANSLATION = /\bt\(\s*['"]([^'"]+)['"]/g;

/**
 * (b) Keyed label properties: data-driven menus and presets keep the
 * dictionary key next to the value (`labelKey`, `hintKey`, `placeholderKey`),
 * and are translated later through `t(key)`, so a plain `t("...")` scan misses
 * them.
 */
const KEYED_LABEL_PROPERTY = /\b(labelKey|hintKey|placeholderKey)\s*:\s*['"]([^'"]+)['"]/g;

/**
 * Literals that look like translation keys but are deliberately not
 * user-facing dictionary entries. Keep this empty unless a real exception
 * appears: every entry needs a comment naming the file and why.
 */
const NON_I18N_KEYS = new Set();

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.jsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

function keyUsages(file) {
  const source = readFileSync(file, "utf8");
  const usages = [];
  for (const match of source.matchAll(LITERAL_TRANSLATION)) {
    usages.push({ key: match[1], kind: "t()" });
  }
  for (const match of source.matchAll(KEYED_LABEL_PROPERTY)) {
    usages.push({ key: match[2], kind: match[1] });
  }
  return usages;
}

const files = SCAN_ROOTS.flatMap((root) => sourceFiles(join(repoRoot, root))).sort();
const usages = files.flatMap((file) => {
  const relative = file.slice(repoRoot.length).replaceAll("\\", "/");
  return keyUsages(file).map((usage) => ({ ...usage, file: relative }));
});

/** One entry per distinct key, so a missing entry reports once with its first use. */
const uniqueKeys = new Map();
for (const { key, kind, file } of usages) {
  if (!uniqueKeys.has(key)) uniqueKeys.set(key, { kind, file });
}

function dictionaryProblems(dictionary, entries = uniqueKeys) {
  const problems = [];
  for (const [key, { kind, file }] of entries) {
    if (NON_I18N_KEYS.has(key)) continue;
    const value = dictionary[key];
    if (typeof value !== "string") {
      problems.push(`missing      ${file}  ${kind}("${key}")`);
    } else if (value.trim() === "") {
      problems.push(`blank        ${file}  ${kind}("${key}")`);
    } else if (value === key) {
      problems.push(`untranslated ${file}  ${kind}("${key}")`);
    }
  }
  return problems;
}

describe("editor translation coverage", () => {
  it("scans every editor component, agent module and editor module", () => {
    // Guards the scope itself: the previous guard covered one directory only.
    expect(files.length).toBeGreaterThan(900);
    expect(usages.length).toBeGreaterThan(2000);
    expect(uniqueKeys.size).toBeGreaterThan(1500);
  });

  it.each([["en", en], ["zh", zh]])(
    "has a translated string for every literal editor key in %s",
    (_locale, dictionary) => {
      const problems = dictionaryProblems(dictionary);
      expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
    },
  );

  it("reports missing, blank and untranslated-fallback keys", () => {
    // Keep the guard honest: prove the detector actually fails on the three
    // ways a key can escape the dictionaries.
    const entries = new Map([
      ["editor.__missing__", { kind: "t()", file: "fixture.jsx" }],
      ["editor.__blank__", { kind: "labelKey", file: "fixture.jsx" }],
      ["editor.__fallback__", { kind: "t()", file: "fixture.jsx" }],
    ]);
    const problems = dictionaryProblems(
      { "editor.__blank__": "  ", "editor.__fallback__": "editor.__fallback__" },
      entries,
    );
    expect(problems).toEqual([
      'missing      fixture.jsx  t()("editor.__missing__")',
      'blank        fixture.jsx  labelKey("editor.__blank__")',
      'untranslated fixture.jsx  t()("editor.__fallback__")',
    ]);
  });
});
