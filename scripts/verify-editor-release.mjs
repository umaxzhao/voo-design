import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommandPool } from "./release-command-pool.mjs";
import { RELEASE_BROWSER_SUITES } from "./editor-module-catalog.mjs";
import { summarizeModuleEvidence } from "./editor-check-plans.mjs";

const BROWSER_CONCURRENCY = 3;
// The startup gate launches three browsers itself; finish it before the pool.
const PREREQUISITE_COUNT = 5;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain")) {
  throw new Error("Release verification requires a clean checkout, including untracked source files.");
}
const revision = git("rev-parse", "HEAD");
const reportPath = process.env.VOO_RELEASE_REPORT ?? join(tmpdir(), `voo-editor-release-${revision.slice(0, 12)}.json`);
const commands = [
  [process.execPath, ["scripts/editor-checks.mjs", "--check"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "lint:design"]],
  ["npm", ["test"]],
  ...RELEASE_BROWSER_SUITES
    .map((suite) => [process.execPath, [`tests/e2e/${suite}.e2e.mjs`]]),
];
const results = [];
const writeReport = (complete = false) => writeFileSync(reportPath, JSON.stringify({
  revision, verifiedAt: new Date().toISOString(), expectedSteps: commands.length,
  browserConcurrency: BROWSER_CONCURRENCY, complete,
  functionalCoverage: "partial",
  moduleResults: summarizeModuleEvidence({ revision, complete, results }, revision).modules,
  results: [...results].sort((left, right) => left.step - right.step),
}, null, 2));
for (const [index, [command, args]] of commands.slice(0, PREREQUISITE_COUNT).entries()) {
  console.log(`Verification ${revision.slice(0, 12)}: ${command} ${args.join(" ")}`);
  const started = Date.now();
  const result = spawnSync(command, args, { stdio: "inherit" });
  results.push({ step: index + 1, command: [command, ...args], exitCode: result.status,
    signal: result.signal, durationMs: Date.now() - started,
    ...(result.error ? { error: { code: result.error.code, message: result.error.message } } : {}) });
  writeReport();
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Verification failed; evidence: ${reportPath}`);
}
try {
  await runCommandPool(commands.slice(PREREQUISITE_COUNT), {
    concurrency: BROWSER_CONCURRENCY,
    onComplete: (result) => {
      console.log(`Verification ${revision.slice(0, 12)}: ${result.command.join(" ")}`);
      if (result.output) process.stdout.write(result.output);
      if (result.error) console.error(result.error.message);
      results.push({ step: result.index + PREREQUISITE_COUNT + 1,
        command: result.command, exitCode: result.exitCode, signal: result.signal,
        durationMs: result.durationMs, stderr: result.stderr,
        ...(result.error ? { error: result.error } : {}) });
      writeReport();
    },
  });
} catch (error) {
  throw new Error(`Verification failed; evidence: ${reportPath}`, { cause: error });
}
if (git("rev-parse", "HEAD") !== revision || git("status", "--porcelain")) {
  throw new Error("Source changed during verification; discard these results and rerun on a clean checkout.");
}
writeReport(true);
console.log(`Verified committed source ${revision}; evidence: ${reportPath}`);
