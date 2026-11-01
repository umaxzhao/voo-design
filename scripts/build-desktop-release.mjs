import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { desktopReleasePlan, releaseChannel } from "./desktop-release-plan.mjs";

const [platform, arch] = process.argv.slice(2);
const plan = desktopReleasePlan(platform, arch);
if (process.platform !== plan.host || process.arch !== arch) {
  throw new Error(`Native runner required for ${platform}/${arch}; got ${process.platform}/${process.arch}`);
}
const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (!process.env.npm_execpath) throw new Error("Run through npm run release:build -- <platform> <arch>");
const configDir = await mkdtemp(path.join(tmpdir(), "voo-desktop-config-"));
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Desktop build step failed: ${args[0]} (exit ${result.status})`);
}
try {
  run([process.env.npm_execpath, "run", "build", "--", "--mode", "electron"]);
  run(["scripts/build-connector-resource.mjs"]);
  const config = { ...pkg.build, publish: pkg.build.publish.map(provider => ({
    ...provider, channel: releaseChannel(pkg.version), releaseType: "draft",
  })) };
  const configPath = path.join(configDir, "electron-builder.json");
  await writeFile(configPath, JSON.stringify(config));
  run(["scripts/signing-env.mjs", `--${platform}`, ...plan.targets, `--${arch}`,
    "--publish", "never", "--config", configPath]);
  run(["scripts/verify-package.mjs", plan.appDir]);
} finally {
  await rm(configDir, { recursive: true, force: true });
}
