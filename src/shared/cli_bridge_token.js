/**
 * Shared CLI bridge token utilities.
 * Handles storage and retrieval of the external CLI bridge authentication token.
 * Mode 0600 file stored under $XDG_CONFIG_HOME/voo-design or ~/.config/voo-design (mode 0700).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const TOKEN_FILE_NAME = "cli-bridge-token";

/**
 * Resolves the configuration directory for voo-design.
 * Uses $XDG_CONFIG_HOME/voo-design if defined, otherwise ~/.config/voo-design.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {string}
 */
export function resolveConfigDir(env = process.env) {
  const custom = env?.XDG_CONFIG_HOME;
  if (typeof custom === "string" && custom.trim().length > 0) {
    return path.join(custom, "voo-design");
  }
  return path.join(os.homedir(), ".config", "voo-design");
}

/**
 * Returns the full file path for the CLI bridge token file.
 *
 * @param {string} [configDir=resolveConfigDir()]
 * @returns {string}
 */
export function tokenFilePath(configDir = resolveConfigDir()) {
  return path.join(configDir, TOKEN_FILE_NAME);
}

/**
 * Writes the given token to the user-only token file with mode 0600,
 * ensuring the directory exists with mode 0700.
 *
 * @param {string} token
 * @param {string} [configDir=resolveConfigDir()]
 * @returns {string} The path to the written token file.
 */
export function writeBridgeToken(token, configDir = resolveConfigDir()) {
  if (!token || typeof token !== "string") {
    throw new Error("CLI bridge token must be a non-empty string");
  }
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(configDir, 0o700);
  } catch {}

  const filePath = tokenFilePath(configDir);
  fs.writeFileSync(filePath, `${token.trim()}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {}

  return filePath;
}

/**
 * Reads the bridge token from the token file, if it exists and is readable.
 * Returns null if the file does not exist or is empty.
 *
 * @param {string} [configDir=resolveConfigDir()]
 * @returns {string | null}
 */
export function readBridgeToken(configDir = resolveConfigDir()) {
  try {
    const filePath = tokenFilePath(configDir);
    const content = fs.readFileSync(filePath, "utf8");
    const token = content.trim();
    return token.length > 0 ? token : null;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
