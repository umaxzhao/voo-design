import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../e2e/", import.meta.url));
const linter = new Linter();
linter.defineRule("synchronous-poll-condition", {
  meta: { type: "problem", schema: [] },
  create: context => ({
    CallExpression(node) {
      const callee = node.callee;
      const name = callee.type === "MemberExpression"
        ? callee.computed ? callee.property.value : callee.property.name : null;
      if (name === "waitForFunction" && node.arguments[0]?.async) {
        context.report({ node, message: "Preload async dependencies and poll a synchronous condition; a Promise can complete polling before it resolves true." });
      }
    },
  }),
});

const inspect = source => linter.verify(source, {
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  rules: { "synchronous-poll-condition": "error" },
}, { allowInlineConfig: false });

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.(?:js|jsx|mjs)$/.test(path) ? [path] : [];
  });
}

it("never uses a direct async predicate for browser state polling", () => {
  const failures = files(root).flatMap(path => inspect(readFileSync(path, "utf8"))
    .map(error => `${relative(root, path)}:${error.line}: ${error.message}`));
  expect(failures).toEqual([]);
});

it("rejects async polling but allows async page evaluation and synchronous conditions", () => {
  expect(inspect("page.waitForFunction(async () => false);")).toHaveLength(1);
  expect(inspect("page['waitForFunction'](async function() { return false; });")).toHaveLength(1);
  expect(inspect("page.evaluate(async () => false); page.waitForFunction(() => window.ready);")).toEqual([]);
});
