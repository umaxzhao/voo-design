import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

const linter = new Linter();
const parseConfig = {
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
};

function visitNodes(node, visit) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (["parent", "tokens", "comments"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => visitNodes(child, visit));
    else if (value && typeof value === "object" && value.type) visitNodes(value, visit);
  }
}

function staticString(node) {
  if (typeof node?.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function moduleReferences(source, fileName) {
  const messages = linter.verify(source, parseConfig, { allowInlineConfig: false });
  const fatal = messages.filter((message) => message.fatal);
  if (fatal.length) throw new Error(`${fileName}: ${fatal.map((message) => message.message).join("; ")}`);
  const references = [];
  visitNodes(linter.getSourceCode().ast, (node) => {
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(node.type)) {
      const value = staticString(node.source);
      if (value?.startsWith(".")) references.push(value);
    }
  });
  return references;
}

function resolvesFrom(fileName, specifier) {
  // Vite resource queries select a loader; they are not part of the filename.
  const target = resolve(dirname(fileName), specifier.split(/[?#]/)[0]);
  const candidates = [
    target,
    ...[".js", ".jsx", ".mjs", ".cjs", ".json"].map((extension) => target + extension),
    ...["index.js", "index.jsx"].map((name) => join(target, name)),
  ];
  return candidates.some((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

describe("source module integrity", () => {
  it("finds literal static/dynamic imports and re-exports without mistaking text or computed paths for imports", () => {
    const source = [
      'import "./style.css";',
      'export { value } from "./value.js";',
      'export * from "./all.js";',
      'await import("./lazy.js");',
      'await import(`./resource.svg?raw`);',
      'await import("./" + variable);',
      '// import "./comment.js";',
      'const example = "import \\\"./example.js\\\"";',
    ].join("\n");
    expect(moduleReferences(source, "example.js")).toEqual([
      "./style.css", "./value.js", "./all.js", "./lazy.js", "./resource.svg?raw",
    ]);
    expect(resolvesFrom("src/App.jsx", "./missing-source-file.js")).toBe(false);
    expect(resolvesFrom("src/App.jsx", "./App.jsx?raw")).toBe(true);
  });

  it("resolves every relative import and re-export in tracked and new source modules", () => {
    // Git's file list respects local/generated exclusions while including new
    // source files. A deleted legacy module is no longer a module to validate.
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "src"], { encoding: "utf8" })
      .split("\0").filter((fileName) => /\.(?:[cm]?js|jsx)$/.test(fileName) && existsSync(fileName));
    const missing = [];
    for (const fileName of files) {
      for (const specifier of moduleReferences(readFileSync(fileName, "utf8"), fileName)) {
        if (!resolvesFrom(fileName, specifier)) missing.push(`${fileName} -> ${specifier}`);
      }
    }
    expect(files.length).toBeGreaterThan(1000);
    expect(missing).toEqual([]);
  }, 10000);
});
