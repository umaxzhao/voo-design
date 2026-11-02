/**
 * Opens the user's own Google Chrome. No automation flags, no remote
 * debugging port, no separate user-data-dir: a debug-port browser is rejected
 * by Google sign-in, and a fresh profile would not be the session that is
 * already signed in. Chrome hands a bare URL to the running instance.
 *
 * `--load-extension` is intentionally absent. Chrome removed it on stable
 * (137+); the extension is loaded unpacked by the user. See
 * docs/web-image-extension.md.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const FORBIDDEN_FLAGS = [
  "--remote-debugging-port",
  "--enable-automation",
  "--headless",
  "--user-data-dir",
  "--load-extension",
  "--disable-blink-features",
];

function coded(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function firstExisting(candidates, exists) {
  return candidates.find((candidate) => candidate && exists(candidate)) ?? null;
}

/**
 * Absolute Chrome binary for this platform, or null when none is installed.
 *
 * @param {object} [options]
 * @param {string} [options.platform]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {(path: string) => boolean} [options.exists]
 */
export function chromeExecutable({
  platform = process.platform,
  env = process.env,
  exists = existsSync,
} = {}) {
  if (env.CHROME_PATH && exists(env.CHROME_PATH)) return env.CHROME_PATH;

  if (platform === "darwin") {
    return firstExisting(
      ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
      exists,
    );
  }

  if (platform === "win32") {
    const roots = [env.LOCALAPPDATA, env.PROGRAMFILES, env["PROGRAMFILES(X86)"]];
    return firstExisting(
      roots
        .filter(Boolean)
        .map((root) => path.join(root, "Google", "Chrome", "Application", "chrome.exe")),
      exists,
    );
  }

  return firstExisting(
    [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    ],
    exists,
  );
}

/** The only argument is the page to open. */
export function chromeLaunchArgs(url) {
  return [url];
}

export function usesAutomationFlags(args) {
  return args.some((arg) =>
    FORBIDDEN_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)),
  );
}

/**
 * Spawns Chrome detached with a single URL. Shell is off so the URL cannot
 * be re-parsed into flags.
 */
export function ensureChrome({
  url,
  platform = process.platform,
  env = process.env,
  exists = existsSync,
  spawn: spawnImpl = spawn,
} = {}) {
  if (!url || typeof url !== "string") throw coded("chromeLaunchFailed");
  const executable = chromeExecutable({ platform, env, exists });
  if (!executable) throw coded("chromeLaunchFailed");
  const args = chromeLaunchArgs(url);
  if (usesAutomationFlags(args)) throw coded("chromeLaunchFailed");

  let child;
  try {
    child = spawnImpl(executable, args, {
      detached: true,
      shell: false,
      stdio: "ignore",
    });
  } catch (error) {
    throw coded("chromeLaunchFailed", error?.message || "chromeLaunchFailed");
  }
  child?.unref?.();
  child?.on?.("error", () => {});
  return { executable, args };
}
