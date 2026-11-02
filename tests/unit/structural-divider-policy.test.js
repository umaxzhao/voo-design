import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createLinter, lintCode } = require("../../design/lint.cjs");
const linter = createLinter(process.cwd());
const filename = "src/canvas/components/divider-audit.jsx";
const borders = async (code) =>
  (await lintCode(linter, code, filename)).filter(
    (result) => result.label === "border",
  );

describe("structural dividers in JSX", () => {
  it("allows a single-side hairline on a marked non-control element", async () => {
    expect(
      await borders(
        'export const View = () => <div data-ui-structure="divider" className="my-1 border-t border-white/10" role="separator" />;',
      ),
    ).toEqual([]);
  });

  it("allows a two-side hairline on a marked header", async () => {
    expect(
      await borders(
        'export const View = () => <header data-ui-structure="divider" className="flex border-t border-b border-white/5" />;',
      ),
    ).toEqual([]);
  });

  it("rejects a full perimeter on a marked element", async () => {
    expect(
      (
        await borders(
          'export const View = () => <div data-ui-structure="divider" className="rounded-xl border border-white/10" />;',
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("rejects a divider marker on a control, even one that is a div", async () => {
    expect(
      (
        await borders(
          'export const View = () => <button data-ui-structure="divider" className="border-b border-white/10" />;',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await borders(
          'export const View = () => <div role="menu" data-ui-structure="divider" className="border-t border-white/10" />;',
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("rejects a divider class on an unmarked element", async () => {
    expect(
      (
        await borders(
          'export const View = () => <div className="border-t border-white/10" />;',
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("does not let a marker on a parent exempt its child control", async () => {
    expect(
      (
        await borders(
          'export const View = () => <div data-ui-structure="divider"><button className="border-t border-white/10" /></div>;',
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
