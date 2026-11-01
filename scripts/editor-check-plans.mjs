import { ACCEPTANCE_AXES, ADDITIONAL_BROWSER_CHECKS, EDITOR_MODULES } from "./editor-module-catalog.mjs";

const identifier = /^[a-z][a-z0-9-]*$/;
const suitePath = suite => `tests/e2e/${suite}.e2e.mjs`;

export function validateModuleCatalog(modules = EDITOR_MODULES, suiteExists = () => true,
  { discoveredSuites = [], additionalChecks = [] } = {}) {
  const ids = new Set(), suites = new Set(), features = new Set();
  for (const module of modules) {
    if (!identifier.test(module.id) || ids.has(module.id)) throw new Error(`Invalid/duplicate module: ${module.id}`);
    ids.add(module.id);
    if (!module.title || !module.paths?.length || !module.features?.length || !module.suites?.length || !module.remaining?.length) {
      throw new Error(`Incomplete module contract: ${module.id}`);
    }
    for (const path of module.paths) {
      if (typeof path !== "string" || path.startsWith("/") || path.split("/").includes("..")) throw new Error(`Unsafe source pattern: ${path}`);
    }
    for (const feature of module.features) {
      if (!/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(feature) || !feature.startsWith(`${module.id}.`) || features.has(feature)) throw new Error(`Invalid/duplicate feature: ${feature}`);
      features.add(feature);
    }
    for (const suite of module.suites) {
      if (!/^[a-z][a-z0-9_-]*$/.test(suite) || suites.has(suite)) throw new Error(`Invalid/duplicate suite: ${suite}`);
      if (!suiteExists(suitePath(suite))) throw new Error(`Missing registered browser suite: ${suite}`);
      suites.add(suite);
    }
  }
  for (const module of modules) for (const related of module.related) {
    if (!ids.has(related) || related === module.id) throw new Error(`Invalid related module: ${module.id} -> ${related}`);
  }
  const additional = new Set();
  for (const check of additionalChecks) {
    if (!/^[a-z][a-z0-9_-]*$/.test(check.suite) || !ids.has(check.owner) || !check.reason?.trim() ||
      !["unreviewed", "hardware", "native", "network", "local", "external"].includes(check.kind)) throw new Error(`Invalid standalone check: ${check.suite}`);
    if (suites.has(check.suite) || additional.has(check.suite)) throw new Error(`Duplicate standalone suite: ${check.suite}`);
    if (!suiteExists(suitePath(check.suite))) throw new Error(`Missing standalone browser suite: ${check.suite}`);
    additional.add(check.suite);
  }
  for (const suite of discoveredSuites) {
    if (!suites.has(suite) && !additional.has(suite)) throw new Error(`Unclassified browser suite: ${suite}`);
  }
  return { modules: ids.size, features: features.size, browserSuites: suites.size, additionalChecks: additional.size };
}

function matches(path, pattern) {
  const expression = pattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${expression}$`).test(path);
}

/** Unknown executable paths widen the plan; missing ownership never means no tests. */
export function modulesForChanges(paths, modules = EDITOR_MODULES) {
  const selected = new Set(), unmapped = [];
  for (const path of paths) {
    if (path.startsWith("docs/") || /^(README|CHANGELOG|AGENTS|Design)\.md$/.test(path)) continue;
    const owners = modules.filter(module => module.paths.some(pattern => matches(path, pattern)) ||
      module.suites.some(suite => suitePath(suite) === path));
    if (!owners.length) unmapped.push(path);
    owners.forEach(module => selected.add(module.id));
  }
  if (unmapped.length) modules.forEach(module => selected.add(module.id));
  return { ids: [...selected], unmapped, fullReleaseRequired: unmapped.length > 0 };
}

export function createModulePlan(ids, modules = EDITOR_MODULES) {
  const byId = new Map(modules.map(module => [module.id, module]));
  const selected = new Set(ids);
  for (const id of ids) {
    const module = byId.get(id);
    if (!module) throw new Error(`Unknown module: ${id}`);
    module.related.forEach(related => selected.add(related));
  }
  const planned = modules.filter(module => selected.has(module.id));
  return { requested: ids, modules: planned.map(module => module.id),
    suites: [...new Set(planned.flatMap(module => module.suites))],
    acceptanceAxes: ACCEPTANCE_AXES,
    additionalChecks: ADDITIONAL_BROWSER_CHECKS.filter(check => selected.has(check.owner))
      .map(check => ({ ...check, execution: "not-run" })),
    coverage: "partial", remaining: planned.flatMap(module => module.remaining) };
}

/** Execution outcomes and functional acceptance are deliberately separate fields. */
export function summarizeModuleEvidence(report, revision, modules = EDITOR_MODULES, { workspaceClean = true } = {}) {
  if (!Array.isArray(report.results) || typeof report.revision !== "string") throw new Error("Invalid release evidence");
  const byPath = new Map();
  for (const result of report.results) {
    if (!Array.isArray(result.command)) throw new Error("Invalid evidence command");
    const path = result.command.at(-1);
    if (!/^tests\/e2e\/.+\.e2e\.mjs$/.test(path)) continue;
    if (byPath.has(path)) throw new Error(`Duplicate evidence: ${path}`);
    byPath.set(path, result);
  }
  const stale = report.revision !== revision || !workspaceClean;
  const complete = report.complete === true && !stale &&
    Number.isInteger(report.expectedSteps) && report.expectedSteps === report.results.length &&
    report.results.every(result => result.exitCode === 0 && !result.signal && !result.error) &&
    modules.every(module => module.suites.every(suite => byPath.has(suitePath(suite))));
  return { revision: report.revision, currentRevision: revision,
    workspaceClean,
    releaseComplete: complete,
    acceptanceAxes: ACCEPTANCE_AXES,
    modules: modules.map(module => {
      const results = module.suites.map(suite => byPath.get(suitePath(suite)));
      const passed = results.filter(result => result?.exitCode === 0 && !result.signal && !result.error).length;
      const failed = results.filter(result => result && (result.exitCode !== 0 || result.signal || result.error)).length;
      return { id: module.id, execution: stale ? "stale" : failed ? "failed" : passed === results.length ? "passed" : "not-run",
        passed, failed, missing: results.filter(result => !result).length,
        functionalCoverage: "partial", features: module.features, remaining: module.remaining };
    }),
    additionalChecks: ADDITIONAL_BROWSER_CHECKS.map(check => ({ ...check, execution: "not-run" })),
  };
}
