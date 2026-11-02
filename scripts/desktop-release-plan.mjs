import path from "node:path";

export const DESKTOP_RELEASE_TARGETS = Object.freeze([
  { platform: "linux", arch: "x64", runner: "ubuntu-24.04", host: "linux" },
  { platform: "win", arch: "x64", runner: "windows-2025", host: "win32" },
  { platform: "mac", arch: "x64", runner: "macos-15-intel", host: "darwin" },
  { platform: "mac", arch: "arm64", runner: "macos-15", host: "darwin" },
]);

export function desktopReleasePlan(platform, arch, root = process.cwd()) {
  const target = DESKTOP_RELEASE_TARGETS.find(item => item.platform === platform && item.arch === arch);
  if (!target) throw new Error(`Unsupported desktop target: ${platform}/${arch}`);
  const output = path.join(root, "release");
  const appDir = platform === "mac"
    ? path.join(output, arch === "arm64" ? "mac-arm64" : "mac", "VOO Design.app")
    : path.join(output, `${platform === "win" ? "win" : "linux"}-unpacked`);
  const executable = platform === "mac" ? path.join(appDir, "Contents", "MacOS", "VOO Design")
    : path.join(appDir, platform === "win" ? "VOO Design.exe" : "voo-design");
  return { ...target, output, appDir, executable,
    targets: platform === "linux" ? ["AppImage"] : platform === "win" ? ["nsis", "portable"] : ["dmg", "zip"],
  };
}

export function releaseChannel(version) {
  if (!/^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$/.test(version)) {
    throw new Error(`Unsupported release version: ${version}`);
  }
  return version.includes("-beta.") ? "beta" : version.includes("-alpha.") ? "alpha" : "latest";
}

/** Only absent/null mask references are equivalent on persistence. Keep all
 * real mask IDs and every other persisted value exact. */
export function canonicalProjectNodes(nodes) {
  return JSON.parse(JSON.stringify(nodes)).map(node => {
    if (node.clipTo == null) delete node.clipTo;
    return node;
  });
}
