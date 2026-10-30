import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const git = (...args) => execFileSync("git", args, {
  encoding: "utf8"
}).trim();
if (git("status", "--porcelain")) throw new Error("Image acceptance requires a clean committed checkout.");
const revision = git("rev-parse", "HEAD");
const directory = resolve(process.env.VOO_IMAGE_AUDIT_DIR ?? join(tmpdir(), `voo-image-audit-${revision.slice(0, 12)}`));
mkdirSync(directory, {
  recursive: true
});
const results = [];
const writeReport = () => writeFileSync(join(directory, "acceptance.json"), JSON.stringify({
  revision,
  recordedAt: new Date().toISOString(),
  scope: "image-editor; video excluded",
  expectedSteps: 6,
  finished: results.length === 6,
  complete: results.length === 6 && results.every(result => result.status === "passed"),
  results
}, null, 2));
const run = (id, script, extraEnv = {}) => {
  console.log(`Image acceptance ${revision.slice(0, 12)}: ${id}`);
  const log = join(directory, `${id}.log`);
  const descriptor = openSync(log, "w");
  const started = Date.now();
  let child;
  try {
    child = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        VOO_IMAGE_AUDIT_DIR: directory,
        ...extraEnv
      },
      stdio: ["ignore", descriptor, descriptor]
    });
  } finally {
    closeSync(descriptor);
  }
  let status = child.status === 0 ? "passed" : "failed";
  if (id === "live-models-and-stock" && child.status !== 0) {
    try {
      const cases = JSON.parse(readFileSync(join(directory, "network.json"), "utf8")).results;
      if (cases.some(result => result.status === "blocked") && !cases.some(result => result.status === "failed")) status = "blocked";
    } catch (error) { console.error(`Network evidence unavailable: ${error.message}`); }
  }
  results.push({
    id,
    status,
    exitCode: child.status,
    durationMs: Date.now() - started,
    log,
    ...(child.error ? {
      error: child.error.message
    } : {})
  });
  writeReport();
  console.log(`${id}: ${status}`);
};
run("release", "scripts/verify-editor-release.mjs", {
  VOO_RELEASE_REPORT: join(directory, "release.json")
});
run("native-electron", "tests/e2e/image-electron.e2e.mjs");
run("live-models-and-stock", "tests/e2e/image-network.e2e.mjs", {
  VOO_NETWORK_CASES: ""
});
run("canvas-performance", "tests/e2e/canvas_fps.e2e.mjs", {
  VOO_URL: "",
  VOO_FPS_NODES: "1000,5000,20000",
  VOO_FPS_MIN: "30",
  VOO_FPS_RESULTS_PATH: join(directory, "fps.json")
});
// Paid requests belong to the user's Gen Image skill and are deliberately separate.
results.push({
  id: "paid-provider-generation-edit-vector",
  status: "blocked",
  reason: process.env.OPENAI_API_KEY ? "Run the authorized Gen Image API request and configured edit/vector providers separately; no paid request is made by this verifier." : "OPENAI_API_KEY is not configured in the process; no paid API request was made."
});
if (git("rev-parse", "HEAD") !== revision || git("status", "--porcelain")) {
  results.push({
    id: "source-immutability",
    status: "failed",
    reason: "Source changed during acceptance."
  });
} else results.push({
  id: "source-immutability",
  status: "passed"
});
writeReport();
console.log(`Image acceptance evidence: ${join(directory, "acceptance.json")}`);
if (results.some(result => result.status !== "passed")) process.exitCode = 1;
