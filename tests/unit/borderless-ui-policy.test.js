import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createLinter, lintCode } = require("../../design/lint.cjs");
const { scanCss } = require("../../design/scan_css.cjs");
const { decorativeBorderTokens } = require("../../design/border-policy.cjs");
const linter = createLinter(process.cwd());
const filename = "src/canvas/components/border-audit.jsx";
const borders = async (code) =>
  (await lintCode(linter, code, filename)).filter(
    (result) => result.label === "border",
  );

describe("borderless interface policy", () => {
  it("does not let an entire dialog opt out as artwork", async () => {
    expect(
      (
        await borders(
          'export const View = () => <div role="dialog" data-ui-guide="artwork" className="border border-white/10" />;',
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    "border border-white/10",
    "hover:border-white/30",
    "ring-1 ring-inset ring-white/20",
    "shadow-[inset_0_0_0_1px_#a7ffd4]",
    "divide-y divide-white/10",
  ])("rejects decorative outline classes: %s", async (classes) => {
    expect(
      (
        await borders(
          `export const View = () => <button className="rounded-xl bg-neutral-800 ${classes}" />;`,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it("guards shared constants as well as inline controls", async () => {
    expect(
      (
        await borders(
          'const surface = "rounded-xl border border-white/10 bg-neutral-900"; export const View = () => <div className={surface} />;',
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it("rejects hidden perimeter techniques in inline styles", async () => {
    expect(
      (
        await borders(
          'export const View = () => <div style={{ boxShadow: "inset 0 0 0 1px white" }} />;',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await borders(
          'export const View = () => <div style={{ border: "1px solid white" }} />;',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      await borders(
        'export const View = () => <div data-ui-guide="artwork" style={{ border: "1px solid white" }} />;',
      ),
    ).toEqual([]);
  });
  it("retains keyboard focus, large corners and transparent resets", async () => {
    expect(
      await borders(
        'export const View = () => <button className="rounded-3xl border-0 bg-neutral-800 focus-visible:ring-2 focus-visible:ring-white" />;',
      ),
    ).toEqual([]);
    expect(
      decorativeBorderTokens(
        "border-none outline-none ring-0 focus-visible:outline-2",
      ),
    ).toEqual([]);
  });
  it("allows explicit local geometry without exempting its panel ancestor", async () => {
    expect(
      await borders(
        'export const View = () => <span data-ui-guide="color-handle" className="size-3 rounded-full border-2 border-white" />;',
      ),
    ).toEqual([]);
    expect(
      (
        await borders(
          'export const View = () => <div data-ui-guide="artwork"><button className="border border-white/10" /></div>;',
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it("rejects unregistered guide labels", async () => {
    expect(
      (
        await borders(
          'export const View = () => <div data-ui-guide="decoration" className="border border-white/10" />;',
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it("does not rewrite generated design content", async () => {
    const code =
      'export const View = () => <div className="border border-white/10" />;';
    expect(
      (await lintCode(linter, code, "src/canvas/codegen/generated.jsx")).filter(
        (result) => result.label === "border",
      ),
    ).toEqual([]);
    expect(
      scanCss(
        ".user-card { border: 2px solid white; }",
        "src/canvas/agent/html_pipeline/tailwind_lite.css",
      ).filter((result) => result.label === "border"),
    ).toEqual([]);
  });
  it("checks raw CSS borders while preserving functional guides", () => {
    expect(
      scanCss(".panel { border: 1px solid white; }").some(
        (result) => result.label === "border",
      ),
    ).toBe(true);
    expect(
      scanCss(
        ".panel { border: 0; } .button:focus-visible { outline: 2px solid white; } .is-drop-target { border: 2px solid white; }",
      ).filter((result) => result.label === "border"),
    ).toEqual([]);
  });
});
