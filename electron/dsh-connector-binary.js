import fs from "node:fs";
import path from "node:path";
import { envOf, homeOf, isFile } from "./dsh-connector-common.js";
import { defaultDshAppPaths } from "./dsh-connector-detection.js";

/** Candidate directories a `dsh` CLI (or launcher) may live in. */
export function dshSearchDirs({ home, platform, env, appPaths, searchDirs, fs: fsImpl }) {
  const envObject = envOf(env);
  const homeDir = homeOf(home, envObject);
  const dirs = [];
  for (const dir of Array.isArray(searchDirs) ? searchDirs : []) {
    if (typeof dir === "string" && dir.trim()) dirs.push(dir);
  }
  if (typeof envObject.PATH === "string" && envObject.PATH) {
    dirs.push(...envObject.PATH.split(path.delimiter));
  }
  dirs.push(
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    path.join(homeDir, ".npm-global", "bin"),
    path.join(homeDir, ".local", "bin"),
    path.join(homeDir, "bin"),
    path.join(homeDir, "Library", "pnpm"),
    path.join(homeDir, ".volta", "bin"),
    path.join(homeDir, ".bun", "bin"),
    path.join(homeDir, ".local", "share", "pnpm"),
    path.join(homeDir, ".nvm", "current", "bin"),
    path.join(homeDir, ".asdf", "shims"),
    path.join(homeDir, ".dsh", "bin"),
  );
  if (platform === "win32") {
    if (envObject.APPDATA) dirs.push(path.join(envObject.APPDATA, "npm"));
    if (envObject.LOCALAPPDATA) dirs.push(path.join(envObject.LOCALAPPDATA, "pnpm"));
  }
  // The desktop app ships its own launcher; it is the last resort when no
  // standalone CLI was installed on PATH.
  const apps = Array.isArray(appPaths)
    ? appPaths
    : defaultDshAppPaths({ home: homeDir, platform, env: envObject });
  for (const appPath of apps) {
    if (typeof appPath !== "string" || !appPath.trim()) continue;
    if (fsImpl.existsSync(appPath)) {
      dirs.push(...appLauncherDirs(appPath));
    }
  }
  return dirs;
}

/** Where a desktop app keeps its bundled CLI launcher. */
export function appLauncherDirs(appPath) {
  const candidates = [];
  if (/\.app$/i.test(appPath)) {
    candidates.push(
      path.join(appPath, "Contents", "Resources", "runtime", "cli", "bin"),
    );
  }
  const appDir = /\.app$/i.test(appPath) ? appPath : path.dirname(appPath);
  candidates.push(
    path.join(appDir, "resources", "runtime", "cli", "bin"),
    path.join(appDir, "Content", "Resources", "runtime", "cli", "bin"),
  );
  return candidates;
}

/**
 * Finds a `dsh` executable: PATH first, then the usual user install dirs, then
 * the desktop app's bundled launcher.
 */
export function findDshBinary({
  home,
  platform = process.platform,
  env = process.env,
  fs: fsImpl = fs,
  searchDirs,
  appPath,
  appPaths,
  binPath,
} = {}) {
  if (typeof binPath === "string" && binPath && isFile(fsImpl, binPath)) {
    return binPath;
  }
  const exeNames =
    platform === "win32" ? ["dsh.cmd", "dsh.exe", "dsh"] : ["dsh"];
  const resolvedAppPaths = Array.isArray(appPaths)
    ? appPaths
    : appPath
      ? [appPath]
      : defaultDshAppPaths({ home, platform, env: envOf(env) });
  const dirs = dshSearchDirs({
    home,
    platform,
    env,
    appPaths: resolvedAppPaths,
    searchDirs,
    fs: fsImpl,
  });
  for (const dir of dirs) {
    if (!dir) continue;
    for (const exe of exeNames) {
      const candidate = path.join(dir, exe);
      if (isFile(fsImpl, candidate)) return candidate;
    }
  }
  return null;
}
