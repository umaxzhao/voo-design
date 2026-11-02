import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
);
const build = pkg.build;

describe("electron-builder commercial packaging config", () => {
  it("defines dist script that builds a Linux AppImage", () => {
    expect(pkg.scripts.dist).toMatch(/scripts\/signing-env\.mjs/);
    expect(pkg.scripts.dist).toMatch(/AppImage/);
  });

  it("covers mac, win, and linux targets", () => {
    expect(build.appId).toBe("run.voo.design");
    expect(build.productName).toBe("VOO Design");
    expect(build.directories.output).toBe("release");
    expect(build.mac.target).toEqual(expect.arrayContaining(["dmg", "zip"]));
    expect(build.mac.icon).toBe("build/icon.icns");
    expect(build.win.icon).toBe("build/icon.ico");
    const winTargets = build.win.target.map((t) =>
      typeof t === "string" ? t : t.target,
    );
    expect(winTargets).toEqual(expect.arrayContaining(["nsis", "portable"]));
    expect(build.linux.target).toEqual(
      expect.arrayContaining(["AppImage", "deb"]),
    );
    expect(build.linux.icon).toBe("build/icon.png");
    expect(build.linux.category).toBe("Graphics");
  });

  it("ships mac entitlements hooks without embedding secrets", () => {
    expect(build.mac.hardenedRuntime).toBe(true);
    expect(build.mac.entitlements).toBe("build/entitlements.mac.plist");
    const entitlements = readFileSync(
      resolve(process.cwd(), "build/entitlements.mac.plist"),
      "utf8",
    );
    expect(entitlements).toMatch(/allow-jit/);
    expect(entitlements).not.toMatch(/BEGIN PRIVATE KEY|PASSWORD|secret/i);
  });
});
