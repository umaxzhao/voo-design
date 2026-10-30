import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommandPool } from "./release-command-pool.mjs";

const BROWSER_CONCURRENCY = 3;
// The startup gate launches three browsers itself; finish it before the pool.
const PREREQUISITE_COUNT = 4;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain")) {
  throw new Error("Release verification requires a clean checkout, including untracked source files.");
}
const revision = git("rev-parse", "HEAD");
const reportPath = process.env.VOO_RELEASE_REPORT ?? join(tmpdir(), `voo-editor-release-${revision.slice(0, 12)}.json`);
const commands = [
  ["npm", ["run", "build"]],
  ["npm", ["run", "lint:design"]],
  ["npm", ["test"]],
  ...[
    "editor-fixture-startup", "editor-effects", "agent-paint-text", "layout-mask-audit", "inspector-controls",
    "stretch-layout", "build-layout-history", "mesh-gradient", "stroke-controls", "boolean-stroke-export",
    "boolean-resize", "container-opacity", "svg-frame-clipping", "frame-clip-review", "drawing-retouch",
    "pending-integration", "settings-i18n", "editor-document-aids", "comments-loading", "comments-lifecycle",
    "editor-loading", "editor-optional-loading", "editor-canvas-navigation", "editor-layers-composition",
    "editor-shortcut-lifecycle", "image-action-loading", "project-picker", "pages_dnd", "editor-snapping",
    "destructive-boolean", "hook-lifecycle", "editor-refactor", "editor-context", "editor-session",
    "editor-page-composition", "raster-loading", "generated-output", "root-contextual-toolbar",
    "frame-child-pointer", "frame-negative-space", "frame-alt-duplicate", "frame-reparent-contracts",
    "frame-surface-camera", "frame-adjustment-space", "gl-spatial-parity",
    "ui-home-settings", "ui-inspector-interaction", "ui-responsive-editor", "ui-global-interaction", "editor-resources", "editor-resources-built",
  ]
    .map((suite) => [process.execPath, [`tests/e2e/${suite}.e2e.mjs`]]),
];
const results = [];
const writeReport = (complete = false) => writeFileSync(reportPath, JSON.stringify({
  revision, verifiedAt: new Date().toISOString(), expectedSteps: commands.length,
  browserConcurrency: BROWSER_CONCURRENCY, complete,
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
