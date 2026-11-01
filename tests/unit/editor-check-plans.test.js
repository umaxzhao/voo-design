import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ADDITIONAL_BROWSER_CHECKS, EDITOR_MODULES, RELEASE_BROWSER_SUITES } from "../../scripts/editor-module-catalog.mjs";
import { validateModuleCatalog, modulesForChanges, createModulePlan, summarizeModuleEvidence } from "../../scripts/editor-check-plans.mjs";

const module = (id, suites, related = []) => ({ id, title: id, paths: [`src/${id}/*`], related,
  features: [`${id}.feature`], suites, remaining: ["Physical devices not verified"] });
const catalog = [module("layers", ["nested-placement"], ["masks"]), module("masks", ["nested-mask-lifecycle"])];
const result = (suite, exitCode = 0) => ({ command: [process.execPath, `tests/e2e/${suite}.e2e.mjs`], exitCode });

describe("module ownership and conservative check planning", () => {
  it("retains all existing release suites exactly once and keeps startup first", () => {
    const discoveredSuites = readdirSync("tests/e2e").filter(path => path.endsWith(".e2e.mjs")).map(path => path.slice(0, -8));
    expect(validateModuleCatalog(EDITOR_MODULES, path => existsSync(path), { discoveredSuites,
      additionalChecks: ADDITIONAL_BROWSER_CHECKS })).toEqual({ modules: 12, features: 85, browserSuites: 101, additionalChecks: 11 });
    expect(RELEASE_BROWSER_SUITES[0]).toBe("editor-fixture-startup");
    expect(new Set(RELEASE_BROWSER_SUITES).size).toBe(101);
    const release = readFileSync("scripts/verify-editor-release.mjs", "utf8");
    expect(release).toContain("...RELEASE_BROWSER_SUITES");
    expect(release).toContain('"scripts/editor-checks.mjs", "--check"');
    expect(release).toContain("summarizeModuleEvidence");
  });
  it("rejects missing files, duplicate owners and broken related-module references", () => {
    expect(() => validateModuleCatalog(catalog, () => false)).toThrow("Missing registered");
    expect(() => validateModuleCatalog([catalog[0], module("masks", ["nested-placement"])] )).toThrow("duplicate suite");
    expect(() => validateModuleCatalog([catalog[0]])).toThrow("Invalid related");
    expect(() => validateModuleCatalog([{ ...catalog[1], paths: ["../secret"] }])).toThrow("Unsafe source");
  });
  it("includes related regression suites and refuses unknown module names", () => {
    expect(createModulePlan(["layers"], catalog)).toMatchObject({ modules: ["layers", "masks"],
      suites: ["nested-placement", "nested-mask-lifecycle"], coverage: "partial" });
    expect(() => createModulePlan(["layerz"], catalog)).toThrow("Unknown module");
  });
  it("rejects a new browser test that was never registered or explicitly scoped out", () => {
    expect(() => validateModuleCatalog(catalog, () => true, { discoveredSuites: ["forgotten-test"] })).toThrow("Unclassified browser suite");
    const additionalChecks = [{ suite: "forgotten-test", owner: "layers", kind: "unreviewed", reason: "Needs actual fixture review" }];
    expect(validateModuleCatalog(catalog, () => true, { discoveredSuites: ["forgotten-test"], additionalChecks }).additionalChecks).toBe(1);
    expect(() => validateModuleCatalog(catalog, () => true, { additionalChecks: [{ ...additionalChecks[0], reason: "" }] })).toThrow("Invalid standalone");
    expect(() => validateModuleCatalog(catalog, () => true, { additionalChecks: [{ ...additionalChecks[0], suite: "nested-placement" }] })).toThrow("Duplicate standalone");
  });
  it("broadens unowned executable paths to the complete gate instead of skipping them", () => {
    expect(modulesForChanges(["src/layers/drag.js"], catalog)).toMatchObject({ ids: ["layers"], unmapped: [] });
    expect(modulesForChanges(["src/new-tool.js"], catalog)).toMatchObject({ ids: ["layers", "masks"], fullReleaseRequired: true });
    expect(modulesForChanges(["package.json"], catalog).fullReleaseRequired).toBe(true);
    expect(modulesForChanges(["docs/architecture.md"], catalog).ids).toEqual([]);
  });
  it("treats dots in ownership patterns literally and maps changed test files", () => {
    const modules = [{ ...catalog[1], paths: ["src/model.js"] }];
    expect(modulesForChanges(["src/modelXjs"], modules).unmapped).toEqual(["src/modelXjs"]);
    expect(modulesForChanges(["tests/e2e/nested-mask-lifecycle.e2e.mjs"], modules).unmapped).toEqual([]);
  });
});

describe("module evidence never certifies untested features", () => {
  it("separates passing registered tests from incomplete functional coverage", () => {
    const report = summarizeModuleEvidence({ revision: "abc", complete: true, expectedSteps: 2,
      results: [result("nested-placement"), result("nested-mask-lifecycle")] }, "abc", catalog);
    expect(report.modules.map(module => module.execution)).toEqual(["passed", "passed"]);
    expect(report.modules.every(module => module.functionalCoverage === "partial")).toBe(true);
    expect(report.releaseComplete).toBe(true);
  });
  it("shows missing/failed results without allowing a complete flag to invent passes", () => {
    const report = summarizeModuleEvidence({ revision: "abc", complete: true,
      results: [result("nested-placement", 1)] }, "abc", catalog);
    expect(report.modules.map(module => module.execution)).toEqual(["failed", "not-run"]);
    expect(report.modules[1].missing).toBe(1);
    expect(report.releaseComplete).toBe(false);
  });
  it("marks evidence from another revision stale and rejects duplicate evidence", () => {
    const report = { revision: "old", complete: true, results: [result("nested-placement")] };
    expect(summarizeModuleEvidence(report, "new", catalog).modules.every(module => module.execution === "stale")).toBe(true);
    expect(summarizeModuleEvidence(report, "new", catalog).releaseComplete).toBe(false);
    expect(() => summarizeModuleEvidence({ ...report, results: [...report.results, ...report.results] }, "old", catalog)).toThrow("Duplicate evidence");
  });
  it("does not use a clean commit's report to certify modified local source", () => {
    const report = { revision: "same", complete: true, expectedSteps: 2,
      results: [result("nested-placement"), result("nested-mask-lifecycle")] };
    const summary = summarizeModuleEvidence(report, "same", catalog, { workspaceClean: false });
    expect(summary.releaseComplete).toBe(false);
    expect(summary.modules.every(module => module.execution === "stale")).toBe(true);
  });
  it("runs the actual CLI and fails on unknown modules and contradictory modes", () => {
    const output = execFileSync(process.execPath, ["scripts/editor-checks.mjs", "--module", "layers", "--json"], { encoding: "utf8" });
    expect(JSON.parse(output).modules).toContain("compositing");
    for (const args of [["--module", "typo"], ["--check", "--run"], ["--run"], ["--base", "HEAD"]]) {
      expect(spawnSync(process.execPath, ["scripts/editor-checks.mjs", ...args]).status).not.toBe(0);
    }
  });
});
