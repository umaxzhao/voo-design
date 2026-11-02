import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function getPackageVersion() {
  return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
}

function getChangelogVersion() {
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  return changelog.match(/^##\s+([^\s]+)\s*$/m)?.[1] ?? null;
}

describe("commercial delivery metadata", () => {
  it("keeps the top changelog entry aligned with package.json", () => {
    expect(getChangelogVersion()).toBe(getPackageVersion());
  });

  it.each(["build/icon.icns", "build/icon.ico", "build/icon.png"])(
    "includes the electron-builder icon %s",
    (iconPath) => {
      expect(existsSync(resolve(root, iconPath))).toBe(true);
    },
  );
});
