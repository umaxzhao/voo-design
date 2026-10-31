import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { EDITOR_MODULES } from "./editor-module-catalog.mjs";
import { validateModuleCatalog, modulesForChanges, createModulePlan, summarizeModuleEvidence } from "./editor-check-plans.mjs";
import { runCommandPool } from "./release-command-pool.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const args = process.argv.slice(2), values = {}, flags = new Set();
const valueOptions = new Set(["--module", "--base", "--evidence"]);
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (valueOptions.has(arg)) {
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${arg}`);
    values[arg] = args[++index];
  } else if (["--list", "--check", "--changed", "--run", "--json"].includes(arg)) flags.add(arg);
  else throw new Error(`Unknown option: ${arg}`);
}
if (values["--module"] && flags.has("--changed")) throw new Error("Choose --module or --changed");
if (flags.has("--check") && (flags.has("--run") || flags.has("--changed") || values["--module"] || values["--evidence"])) throw new Error("--check only validates registration");
if (values["--base"] && !flags.has("--changed")) throw new Error("--base requires --changed");
if (values["--evidence"] && (flags.has("--run") || flags.has("--changed") || values["--module"])) throw new Error("Evidence inspection does not execute a plan");
const validation = validateModuleCatalog(EDITOR_MODULES, path => existsSync(resolve(root, path)));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
let result;
if (values["--evidence"]) {
  result = summarizeModuleEvidence(JSON.parse(readFileSync(resolve(values["--evidence"]), "utf8")),
    git("rev-parse", "HEAD").trim(), EDITOR_MODULES, { workspaceClean: !git("status", "--porcelain").trim() });
} else if (flags.has("--check")) {
  result = { ...validation, registration: "valid", functionalCoverage: "partial" };
} else if (flags.has("--changed") || values["--module"]) {
  let impact = {};
  let ids;
  if (flags.has("--changed")) {
    const ref = values["--base"] ?? "HEAD";
    const base = git("rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`).trim();
    const paths = [...new Set((git("diff", "--name-only", "--no-renames", "-z", base, "--") +
      git("ls-files", "--others", "--exclude-standard", "-z")).split("\0").filter(Boolean))];
    impact = { paths, ...modulesForChanges(paths) }; ids = impact.ids;
  } else ids = values["--module"].split(",");
  result = { ...createModulePlan(ids), ...impact };
  if (flags.has("--run")) {
    const commands = result.suites.map(suite => [process.execPath, [`tests/e2e/${suite}.e2e.mjs`]]);
    // Local plans can inspect dirty work; they are never release certificates.
    const results = await runCommandPool(commands, { concurrency: 3, onComplete: entry => {
      process.stderr.write(entry.output);
    } });
    result = { ...result, execution: "passed", executedSuites: results.length, releaseEvidence: false };
  }
} else {
  if (flags.has("--run")) throw new Error("--run requires --module or --changed");
  result = { ...validation, modules: EDITOR_MODULES.map(({ id, title, features, suites, remaining }) => ({
    id, title, features, suites, functionalCoverage: "partial", remaining,
  })) };
}
if (flags.has("--json")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write("Registered tests passing does not certify every feature or platform. See docs/engineering-workflow.md.\n");
}
