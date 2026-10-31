import {
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function getDefaultAntigravitySettingsPath() {
  if (process.env.VOO_ANTIGRAVITY_SETTINGS_PATH) {
    return process.env.VOO_ANTIGRAVITY_SETTINGS_PATH;
  }
  return path.join(
    os.homedir(),
    ".gemini",
    "antigravity-cli",
    "settings.json",
  );
}

const VOO_MCP_PERMISSION = "mcp(voo/*)";

/** Prepares account auth and permits only VOO's mediated canvas MCP tools. */
export async function prepareAntigravityAccountAuth({
  settingsPath = getDefaultAntigravitySettingsPath(),
  hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim()),
} = {}) {
  let contents;
  try {
    contents = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    contents = null;
  }

  const settings = contents === null ? {} : JSON.parse(contents);
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new TypeError("Antigravity settings must contain a JSON object");
  }
  const permissions = settings.permissions ?? {};
  if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
    throw new TypeError("Antigravity permissions must contain a JSON object");
  }
  const allow = permissions.allow ?? [];
  if (!Array.isArray(allow) || allow.some((entry) => typeof entry !== "string")) {
    throw new TypeError("Antigravity permissions.allow must be an array of strings");
  }

  const updatedSettings = { ...settings };
  if (!hasApiKey && updatedSettings.modelProvider === "gemini") {
    delete updatedSettings.modelProvider;
  }
  if (!allow.includes(VOO_MCP_PERMISSION)) {
    updatedSettings.permissions = {
      ...permissions,
      allow: [...allow, VOO_MCP_PERMISSION],
    };
  }
  const changed = JSON.stringify(updatedSettings) !== JSON.stringify(settings);
  if (!changed) return { changed: false };

  let backupPath;
  if (contents !== null) {
    backupPath = `${settingsPath}.voo-backup`;
    try {
      await copyFile(settingsPath, backupPath, constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }

  const directory = path.dirname(settingsPath);
  const temporaryPath = path.join(directory, `.settings.${randomUUID()}.tmp`);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(updatedSettings, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, settingsPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }

  return { changed: true, ...(backupPath ? { backupPath } : {}) };
}
