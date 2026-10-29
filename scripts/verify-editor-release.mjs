import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  ...["editor-effects", "agent-paint-text", "layout-mask-audit", "inspector-controls", "stroke-controls", "boolean-stroke-export", "boolean-resize", "container-opacity", "svg-frame-clipping", "frame-clip-review", "drawing-retouch", "pending-integration", "settings-i18n", "editor-document-aids", "comments-loading", "comments-lifecycle", "editor-loading", "editor-optional-loading", "editor-canvas-navigation", "project-picker", "editor-snapping", "destructive-boolean", "hook-lifecycle", "editor-refactor", "editor-context", "editor-session", "editor-page-composition", "raster-loading", "generated-output", "root-contextual-toolbar", "frame-child-pointer", "gl-spatial-parity"]
    .map((suite) => [process.execPath, [`tests/e2e/${suite}.e2e.mjs`]]),
];
const results = [];
for (const [command, args] of commands) {
  console.log(`Verification ${revision.slice(0, 12)}: ${command} ${args.join(" ")}`);
  const started = Date.now();
  const result = spawnSync(command, args, { stdio: "inherit" });
  results.push({ command: [command, ...args], exitCode: result.status, durationMs: Date.now() - started });
  writeFileSync(reportPath, JSON.stringify({ revision, verifiedAt: new Date().toISOString(), results }, null, 2));
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Verification failed; evidence: ${reportPath}`);
}
if (git("rev-parse", "HEAD") !== revision || git("status", "--porcelain")) {
  throw new Error("Source changed during verification; discard these results and rerun on a clean checkout.");
}
console.log(`Verified committed source ${revision}; evidence: ${reportPath}`);
