import fs from "node:fs";
import path from "node:path";
import { DSH_CONNECTOR_PACKAGE, DSH_CONNECTOR_DIRNAME, DSH_APP_NAME, CONNECTOR_PATCH_RE, DSH_APP_PATH_ENV, envOf, homeOf, isDirectory, readText, pickTargetProfile, dshInstallCommand } from "./dsh-connector-common.js";

/**
 * The per-user data directory Electron would use, with a candidate probe so a
 * VOO install from an older product name is still found. `app.getPath("userData")`
 * is authoritative wherever it is available; this only covers the bridge and
 * tests, where there is no Electron app to ask.
 */
export function defaultUserDataDir({
  home,
  platform = process.platform,
  env = process.env,
  fs: fsImpl = fs,
} = {}) {
  const envObject = envOf(env);
  const homeDir = homeOf(home, envObject);
  let base;
  if (platform === "darwin") {
    base = path.join(homeDir, "Library", "Application Support");
  } else if (platform === "win32") {
    base = envObject.APPDATA || path.join(homeDir, "AppData", "Roaming");
  } else {
    base = envObject.XDG_CONFIG_HOME || path.join(homeDir, ".config");
  }
  // `VOO Design` is the current product name; `VOO` was the earlier one.
  const candidates = ["VOO Design", "VOO"];
  for (const name of candidates) {
    const candidate = path.join(base, name);
    if (isDirectory(fsImpl, candidate)) return candidate;
  }
  return path.join(base, candidates[0]);
}

/** The `~/.dsh` home (or `$DSH_HOME`) that holds the profiles. */
export function defaultDshHome({ home, env = process.env } = {}) {
  const envObject = envOf(env);
  return envObject.DSH_HOME || path.join(homeOf(home, envObject), ".dsh");
}

/**
 * Places the harness desktop app may live in, in probe order. Only existing
 * paths are returned by `resolveAppPath`, so a bare candidate list is harmless.
 */
export function defaultDshAppPaths({ home, platform = process.platform, env = process.env } = {}) {
  const envObject = envOf(env);
  const homeDir = homeOf(home, envObject);
  const candidates = [];
  if (envObject[DSH_APP_PATH_ENV]) candidates.push(envObject[DSH_APP_PATH_ENV]);
  if (platform === "darwin") {
    candidates.push(`/Applications/${DSH_APP_NAME}.app`);
    candidates.push(path.join(homeDir, "Applications", `${DSH_APP_NAME}.app`));
  } else if (platform === "win32") {
    const localAppData =
      envObject.LOCALAPPDATA || path.join(homeDir, "AppData", "Local");
    const programFiles = envObject.PROGRAMFILES || "C:\\Program Files";
    candidates.push(
      path.join(localAppData, "Programs", DSH_APP_NAME, `${DSH_APP_NAME}.exe`),
      path.join(programFiles, DSH_APP_NAME, `${DSH_APP_NAME}.exe`),
    );
  } else {
    candidates.push(
      path.join("/opt", DSH_APP_NAME, "deepseek-harness"),
      "/opt/deepseek-harness/deepseek-harness",
      "/usr/bin/deepseek-harness",
      "/usr/local/bin/deepseek-harness",
      path.join(homeDir, ".local", "share", "deepseek-harness", "deepseek-harness"),
    );
  }
  return candidates;
}

/** The first harness app path that actually exists, or null. */
export function resolveDshAppPath({
  home,
  platform = process.platform,
  env = process.env,
  fs: fsImpl = fs,
  appPaths,
} = {}) {
  const envObject = envOf(env);
  const candidates = Array.isArray(appPaths)
    ? appPaths
    : defaultDshAppPaths({ home: homeOf(home, envObject), platform, env: envObject });
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    if (fsImpl.existsSync(candidate)) return candidate;
  }
  return null;
}

/** The dependency value (or null) declaring the connector in a profile. */
export function connectorDependency(packageJson) {
  if (!packageJson || typeof packageJson !== "object") return null;
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const dependency = packageJson[field]?.[DSH_CONNECTOR_PACKAGE];
    if (typeof dependency === "string" && dependency.trim()) return dependency.trim();
  }
  return null;
}

/** Bundles listed under `dsh.profile.bundles` also activate the connector. */
export function listedAsBundle(packageJson) {
  const bundles = packageJson?.dsh?.profile?.bundles;
  return (
    Array.isArray(bundles) &&
    bundles.some((bundle) => bundle === DSH_CONNECTOR_PACKAGE)
  );
}

/** Resolves a `link:`/`file:` dependency or a node_modules symlink to its dir. */
export function connectorLinkOf({ dependency, nodeModulesPath, profilePath, fs: fsImpl }) {
  if (typeof dependency === "string") {
    const match = /^(?:link|file):(.+)$/.exec(dependency);
    if (match) {
      try {
        return path.resolve(profilePath, match[1]);
      } catch {
        return match[1];
      }
    }
    try {
      return fsImpl.realpathSync(dependency);
    } catch {
      // A registry dependency has no on-disk connector directory.
    }
  }
  try {
    const target = fsImpl.readlinkSync(nodeModulesPath);
    return path.resolve(path.dirname(nodeModulesPath), target);
  } catch {
    return null;
  }
}

/** Reads one profile: is the connector declared, linked or patched in? */
export function readDshProfile(profilePath, { fs: fsImpl = fs } = {}) {
  const packageJson = (() => {
    const raw = readText(fsImpl, path.join(profilePath, "package.json"));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();
  const dependency = connectorDependency(packageJson);
  const nodeModulesPath = path.join(
    profilePath,
    "node_modules",
    DSH_CONNECTOR_PACKAGE,
  );
  const hasNodeModules = fsImpl.existsSync(nodeModulesPath);
  const patch = readText(fsImpl, path.join(profilePath, "cordis.patch.yml"));
  const patchMentionsConnector = Boolean(patch && CONNECTOR_PATCH_RE.test(patch));
  return {
    pluginInstalled:
      Boolean(dependency) ||
      hasNodeModules ||
      patchMentionsConnector ||
      listedAsBundle(packageJson),
    connectorLink: connectorLinkOf({
      dependency,
      nodeModulesPath,
      profilePath,
      fs: fsImpl,
    }),
  };
}

/** Every profile under `<dshHome>/profiles`, sorted by name. */
export function readDshProfiles({
  home,
  env = process.env,
  fs: fsImpl = fs,
  dshHome,
} = {}) {
  const profileRoot = path.join(
    dshHome || defaultDshHome({ home, env }),
    "profiles",
  );
  let entries;
  try {
    entries = fsImpl.readdirSync(profileRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries
    .filter((entry) => entry && typeof entry.name === "string")
    .filter((entry) => entry.name !== "node_modules" && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  const profiles = [];
  for (const name of names) {
    const profilePath = path.join(profileRoot, name);
    if (!isDirectory(fsImpl, profilePath)) continue;
    profiles.push({
      name,
      path: profilePath,
      ...readDshProfile(profilePath, { fs: fsImpl }),
    });
  }
  return profiles;
}

/**
 * Reads the harness app + connector state. Pure read: no child processes, no
 * caching, JSON-safe.
 *
 * @returns {{
 *   appInstalled: boolean,
 *   appPath: string|null,
 *   pluginInstalled: boolean,
 *   profiles: Array<{ name: string, path: string, pluginInstalled: boolean, connectorLink: string|null }>,
 *   connectorDir: string,
 *   installCommand: string,
 * }}
 */
export function readDshStatus({
  userDataDir,
  home,
  platform = process.platform,
  fs: fsImpl = fs,
  env = process.env,
  appPaths,
  dshHome,
} = {}) {
  const envObject = envOf(env);
  const homeDir = homeOf(home, envObject);
  const resolvedUserDataDir =
    userDataDir ||
    defaultUserDataDir({
      home: homeDir,
      platform,
      env: envObject,
      fs: fsImpl,
    });
  const appPath = resolveDshAppPath({
    home: homeDir,
    platform,
    env: envObject,
    fs: fsImpl,
    appPaths,
  });
  const profiles = readDshProfiles({
    home: homeDir,
    env: envObject,
    fs: fsImpl,
    dshHome,
  });
  const connectorDir = path.join(
    resolvedUserDataDir,
    "connectors",
    DSH_CONNECTOR_DIRNAME,
  );
  const targetProfile = pickTargetProfile(profiles);
  return {
    appInstalled: Boolean(appPath),
    appPath: appPath || null,
    pluginInstalled: profiles.some((profile) => profile.pluginInstalled),
    profiles,
    connectorDir,
    // Shown to the user verbatim so a terminal can run it: the link spec is
    // quoted because the connector path usually contains a space
    // ("Application Support/VOO Design"), and `--profile` is required by the
    // dsh CLI before the forwarded pnpm args.
    installCommand: dshInstallCommand(connectorDir, targetProfile),
    targetProfile,
  };
}
