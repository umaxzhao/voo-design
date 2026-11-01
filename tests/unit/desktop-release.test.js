import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { assembleDesktopRelease } from "../../scripts/assemble-desktop-release.mjs";
import { DESKTOP_RELEASE_TARGETS, desktopReleasePlan, releaseChannel, canonicalProjectNodes } from "../../scripts/desktop-release-plan.mjs";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");
const version = "1.0.0-beta.1";
const revision = "a".repeat(40);
const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "voo-release-assets-")); roots.push(root);
  const inputDir = path.join(root, "input"); await mkdir(inputDir);
  for (const target of DESKTOP_RELEASE_TARGETS) {
    const directory = path.join(inputDir, `${target.platform}-${target.arch}`); await mkdir(directory);
    const report = { ...target, version, revision, packaged: true, checks: ["pointer", "filesystem", "cold-open"], errors: [] };
    await writeFile(path.join(directory, `${target.platform}-${target.arch}.json`), JSON.stringify(report));
    const prefix = `VOO-Design-${version}-${target.platform}-${target.arch}`;
    const suffixes = target.platform === "mac" ? [".dmg", ".zip"] : target.platform === "win" ? ["-setup.exe", "-portable.exe"] : [".AppImage"];
    const entries = [];
    for (const suffix of suffixes) {
      const url = prefix + suffix; const bytes = Buffer.from(`test payload ${url}`);
      await writeFile(path.join(directory, url), bytes);
      entries.push({ url, size: bytes.length, sha512: createHash("sha512").update(bytes).digest("base64") });
    }
    const name = target.platform === "mac" ? "beta-mac.yml" : target.platform === "win" ? "beta.yml" : "beta-linux.yml";
    await writeFile(path.join(directory, name), yaml.dump({ version, files: entries }));
  }
  return { inputDir, outputDir: path.join(root, "output"), version, revision };
}

describe("desktop release acceptance", () => {
  it("canonicalizes absent masks only, preserving actual mask references and geometry", () => {
    expect(canonicalProjectNodes([{ id: "a", clipTo: null, x: 1 }, { id: "b", clipTo: "mask" }]))
      .toEqual([{ id: "a", x: 1 }, { id: "b", clipTo: "mask" }]);
  });
  it("defines explicit native Intel/Apple Silicon runners and rejects unsupported targets", () => {
    expect(desktopReleasePlan("mac", "arm64").appDir).toContain("mac-arm64");
    expect(desktopReleasePlan("mac", "x64").runner).toBe("macos-15-intel");
    expect(() => desktopReleasePlan("win", "arm64")).toThrow("Unsupported");
    expect(releaseChannel(version)).toBe("beta");
    expect(releaseChannel("1.0.0")).toBe("latest");
    expect(() => releaseChannel("../escape")).toThrow();
  });
  it("merges both Mac update payloads without clobbering either architecture and verifies every checksum", async () => {
    const options = await fixture(); const result = await assembleDesktopRelease(options);
    expect(result.platforms).toHaveLength(4);
    const metadata = yaml.load(await readFile(path.join(options.outputDir, "beta-mac.yml"), "utf8"));
    expect(metadata.files).toHaveLength(4);
    expect(metadata.path).toContain("-mac-x64.zip");
    const sums = (await readFile(path.join(options.outputDir, "SHA256SUMS.txt"), "utf8")).trim().split("\n");
    for (const line of sums) {
      const [hash, file] = line.split("  ");
      expect(createHash("sha256").update(await readFile(path.join(options.outputDir, file))).digest("hex")).toBe(hash);
    }
  });
  it("refuses release assembly if one platform was never actually checked", async () => {
    const options = await fixture();
    await rm(path.join(options.inputDir, "mac-arm64/mac-arm64.json"));
    await expect(assembleDesktopRelease(options)).rejects.toThrow("Expected one smoke report");
  });
  it("rejects evidence for a different commit rather than inheriting old passes", async () => {
    const options = await fixture();
    const file = path.join(options.inputDir, "win-x64/win-x64.json");
    const report = JSON.parse(await readFile(file, "utf8")); report.revision = "b".repeat(40);
    await writeFile(file, JSON.stringify(report));
    await expect(assembleDesktopRelease(options)).rejects.toThrow();
  });
  it("rejects corrupt update payloads", async () => {
    const options = await fixture();
    await writeFile(path.join(options.inputDir, `linux-x64/VOO-Design-${version}-linux-x64.AppImage`), "corrupt");
    await expect(assembleDesktopRelease(options)).rejects.toThrow("Corrupt update payload");
  });
  it("rejects missing installer formats even when every smoke report exists", async () => {
    const options = await fixture();
    await rm(path.join(options.inputDir, `win-x64/VOO-Design-${version}-win-x64-portable.exe`));
    await expect(assembleDesktopRelease(options)).rejects.toThrow("Missing installer");
  });
});
