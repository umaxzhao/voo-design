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

/** Removes the API-key-only provider setting so agy can use account auth. */
export async function prepareAntigravityAccountAuth({
  settingsPath = getDefaultAntigravitySettingsPath(),
  hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim()),
} = {}) {
  if (hasApiKey) return { changed: false };

  let contents;
  try {
    contents = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { changed: false };
    throw error;
  }

  const settings = JSON.parse(contents);
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new TypeError("Antigravity settings must contain a JSON object");
  }
  if (settings.modelProvider !== "gemini") return { changed: false };

  const backupPath = `${settingsPath}.voo-backup`;
  try {
    await copyFile(settingsPath, backupPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }

  const updatedSettings = { ...settings };
  delete updatedSettings.modelProvider;

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

  return { changed: true, backupPath };
}
