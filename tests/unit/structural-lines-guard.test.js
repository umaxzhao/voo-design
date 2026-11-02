import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { scanCss } = require("../../design/scan_css.cjs");
const {
  STRUCTURAL_CSS,
  STRUCTURAL_JSX_COUNTS,
  isStructuralCssDeclaration,
} = require("../../design/structural-lines.cjs");
const { isDividerToken } = require("../../design/border-policy.cjs");

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => readFileSync(`${ROOT}${file}`, "utf8");
const borderFindings = (css, file) =>
  scanCss(css, file).filter((result) => result.label === "border");

/** Counts `data-ui-structure="divider"` markers in every source file under src/. */
function listDividerMarkers() {
  const { execFileSync } = require("node:child_process");
  const out = execFileSync(
    "git",
    ["grep", "-c", 'data-ui-structure="divider"', "--", "src"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return Object.fromEntries(
    out
      .trim()
      .split("\n")
      .map((line) => {
        const index = line.lastIndexOf(":");
        return [line.slice(0, index), Number(line.slice(index + 1))];
      }),
  );
}

describe("structural lines are registered and present", () => {
  it.each(STRUCTURAL_CSS.map((entry) => [entry.file, entry.selector, entry.declaration]))(
    "keeps %s %s { %s }",
    (file, selector, declaration) => {
      const source = read(file);
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const block = new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "g");
      const blocks = source.match(block) ?? [];
      const declared = declaration.replace(/\s+/g, " ");
      const present = blocks.some((text) =>
        text.replace(/\s+/g, " ").includes(declared),
      );
      expect(present, `${file} lost structural line "${selector}"`).toBe(true);
    },
  );

  it.each(Object.entries(STRUCTURAL_JSX_COUNTS))(
    "keeps the registered divider count in %s",
    (file, expected) => {
      const actual = listDividerMarkers()[file] ?? 0;
      expect(actual, `${file} divider markers changed`).toBe(expected);
    },
  );

  it("has no divider marker outside the registry", () => {
    const registered = Object.entries(STRUCTURAL_JSX_COUNTS)
      .filter(([, count]) => count > 0)
      .map(([file]) => file)
      .sort();
    const found = Object.keys(listDividerMarkers()).sort();
    expect(found).toEqual(registered);
  });
});

describe("structural exemptions are exact", () => {
  it.each(STRUCTURAL_CSS.map((entry) => [entry.file, entry.selector, entry.declaration]))(
    "exempts only the registered declaration of %s %s",
    (file, selector, declaration) => {
      const [prop, ...rest] = declaration.split(":");
      const value = rest.join(":").trim();
      expect(isStructuralCssDeclaration(file, selector, prop.trim(), value)).toBe(true);
      expect(
        borderFindings(`${selector} { ${declaration}; }`, file),
      ).toEqual([]);
    },
  );

  it("keeps a same-selector border with a different colour decorative", () => {
    expect(
      borderFindings(
        ".editor-shell { border: 2px solid #ff0000; }",
        "src/index.css",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("does not exempt a registered selector in an unregistered file", () => {
    expect(
      borderFindings(
        ".editor-shell { border: 2px solid #b2ffd6; }",
        "src/canvas/components/other.css",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("does not exempt a control's perimeter border", () => {
    expect(
      borderFindings(".save-button { border: 1px solid #fff; }", "src/x.css")
        .length,
    ).toBeGreaterThan(0);
  });

  it("accepts only single-side or neutral translucent divider tokens", () => {
    expect(isDividerToken("border-t")).toBe(true);
    expect(isDividerToken("border-b")).toBe(true);
    expect(isDividerToken("border-white/10")).toBe(true);
    expect(isDividerToken("border-white/[0.06]")).toBe(true);
    expect(isDividerToken("border")).toBe(false);
    expect(isDividerToken("border-2")).toBe(false);
    expect(isDividerToken("border-[#b2ffd6]")).toBe(false);
    expect(isDividerToken("ring-1")).toBe(false);
  });
});
