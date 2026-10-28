import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { Linter } from "eslint";
import { expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));
const linter = new Linter();

function disabledHookRules(source) {
  linter.verify(source, {
    parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  }, { allowInlineConfig: false });
  return (linter.getSourceCode()?.getAllComments() ?? []).filter(comment =>
    /\beslint-disable(?:-next-line|-line)?\b/.test(comment.value) &&
    /\breact-hooks\/exhaustive-deps\b/.test(comment.value));
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:js|jsx|mjs)$/.test(path) ? [path] : [];
  });
}

it("keeps React dependency-rule suppressions out of production source", () => {
  // This is a suppression-policy check, not a substitute for the undeclared
  // react-hooks ESLint plugin. Real lifecycle behavior has browser regressions.
  const violations = sourceFiles(sourceRoot).flatMap(path =>
    disabledHookRules(readFileSync(path, "utf8")).map(comment =>
      `${relative(sourceRoot, path)}:${comment.loc.start.line}`));
  expect(violations).toEqual([]);
});

it("detects line and multiline directives without flagging a string literal", () => {
  expect(disabledHookRules('// eslint-disable-next-line react-hooks/exhaustive-deps\nconst x=1;')).toHaveLength(1);
  expect(disabledHookRules('/* eslint-disable\n react-hooks/exhaustive-deps, no-undef */\nconst x=1;')).toHaveLength(1);
  expect(disabledHookRules('const text="eslint-disable react-hooks/exhaustive-deps";')).toEqual([]);
});
