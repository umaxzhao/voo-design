import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DESKTOP_RELEASE_TARGETS, releaseChannel } from "./desktop-release-plan.mjs";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml"); // Already locked by electron-builder; no new dependency.
const digest = (bytes, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(bytes).digest(encoding);

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release input must not contain symlinks: ${entry.name}`);
    if (entry.isDirectory()) result.push(...await walk(file));
    else result.push(file);
  }
  return result.sort();
}

/** Require passing native smoke evidence before assembling release payloads. */
export async function assembleDesktopRelease({ inputDir, outputDir, version, revision }) {
  assert.match(revision, /^[0-9a-f]{40}$/);
  const channel = releaseChannel(version);
  const files = await walk(inputDir);
  const assets = new Map();
  const manifests = new Map();
  const evidence = [];
  for (const target of DESKTOP_RELEASE_TARGETS) {
    const name = `${target.platform}-${target.arch}.json`;
    const matches = files.filter(file => path.basename(file) === name);
    assert.equal(matches.length, 1, `Expected one smoke report for ${name}`);
    const report = JSON.parse(await readFile(matches[0], "utf8"));
    assert.equal(report.platform, target.platform); assert.equal(report.arch, target.arch);
    assert.equal(report.version, version); assert.equal(report.revision, revision);
    assert.equal(report.packaged, true); assert.equal(report.checks?.length, 3);
    assert.deepEqual(report.errors, []);
    evidence.push(report);
    assets.set(`checks-${name}`, Buffer.from(JSON.stringify(report, null, 2)));
  }
  for (const file of files) {
    const name = path.basename(file);
    const bytes = await readFile(file);
    if (/^(?:latest|beta|alpha)(?:-mac|-linux)?\.yml$/.test(name)) {
      const manifest = yaml.load(bytes.toString());
      assert.equal(manifest.version, version, `Metadata version mismatch: ${name}`);
      assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
      const previous = manifests.get(name);
      if (!previous) manifests.set(name, manifest);
      else {
        for (const entry of manifest.files) {
          const duplicate = previous.files.find(item => item.url === entry.url);
          if (duplicate) assert.deepEqual(duplicate, entry, `Conflicting update entry: ${entry.url}`);
          else previous.files.push(entry);
        }
      }
    } else if (/\.(?:AppImage|dmg|zip|exe|blockmap)$/.test(name)) {
      assert.ok(name.startsWith(`VOO-Design-${version}-`), `Unexpected installer: ${name}`);
      if (assets.has(name)) assert.ok(assets.get(name).equals(bytes), `Conflicting release asset: ${name}`);
      assets.set(name, bytes);
    }
  }
  for (const target of DESKTOP_RELEASE_TARGETS) {
    const prefix = `VOO-Design-${version}-${target.platform}-${target.arch}`;
    const suffixes = target.platform === "linux" ? [".AppImage"] : target.platform === "mac"
      ? [".dmg", ".zip"] : ["-setup.exe", "-portable.exe"];
    for (const suffix of suffixes) assert.ok(assets.has(prefix + suffix), `Missing installer: ${prefix + suffix}`);
  }
  for (const name of [`${channel}.yml`, `${channel}-linux.yml`, `${channel}-mac.yml`]) {
    const manifest = manifests.get(name);
    assert.ok(manifest, `Missing update metadata: ${name}`);
    manifest.files.sort((left, right) => left.url.localeCompare(right.url));
    for (const entry of manifest.files) {
      assert.equal(path.basename(entry.url), entry.url, "Update entries must be local asset names");
      const binary = assets.get(entry.url);
      assert.ok(binary, `Missing update payload: ${entry.url}`);
      assert.equal(entry.sha512, digest(binary, "sha512", "base64"), `Corrupt update payload: ${entry.url}`);
      assert.equal(entry.size, binary.length, `Update size mismatch: ${entry.url}`);
    }
    const preferred = manifest.files.find(file => file.url.includes("-mac-x64") && file.url.endsWith(".zip")) ?? manifest.files[0];
    manifest.path = preferred.url; manifest.sha512 = preferred.sha512;
    assets.set(name, Buffer.from(yaml.dump(manifest, { lineWidth: -1 })));
  }
  assert.ok(!manifests.has(`${channel === "latest" ? "beta" : "latest"}.yml`), "Unexpected cross-channel update metadata");
  await mkdir(outputDir, { recursive: false });
  for (const [name, bytes] of assets) await writeFile(path.join(outputDir, name), bytes);
  const checksums = [...assets].sort(([a], [b]) => a.localeCompare(b))
    .map(([name, bytes]) => `${digest(bytes)}  ${name}`).join("\n") + "\n";
  await writeFile(path.join(outputDir, "SHA256SUMS.txt"), checksums);
  const notes = `# VOO Design ${version}\n\nDraft desktop prerelease built from ${revision}.\n\n` +
    "Downloads: Windows x64 setup/portable, macOS Intel and Apple Silicon DMG/ZIP, Linux x64 AppImage.\n\n" +
    "All four native runner checks passed: packaged startup, real pointer drawing/undo, native filesystem roundtrip and reopening the physical project in a fresh process/profile.\n\n" +
    "Signing/notarization is not certified by these smoke checks. Without configured CI signing credentials, preview builds are unsigned/not notarized and OS trust prompts may block installation.\n\n" +
    "Still unverified: interactive installer UX, live paid/CLI/model services, and upgrading from an older installed version. This is not a stable release or a complete product certification.\n\n" +
    "Verify downloads with SHA256SUMS.txt. Update manifests and every generated blockmap are included.\n";
  await writeFile(path.join(outputDir, "RELEASE-NOTES.md"), notes);
  return { version, revision, platforms: evidence.map(({ platform, arch }) => `${platform}/${arch}`), assets: assets.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  console.log(await assembleDesktopRelease({ inputDir: process.argv[2], outputDir: process.argv[3],
    version: pkg.version, revision: process.env.GITHUB_SHA }));
}
