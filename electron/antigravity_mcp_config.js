import fs from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function getDefaultMcpConfigPath() {
  if (process.env.VOO_GEMINI_CONFIG_PATH) {
    return process.env.VOO_GEMINI_CONFIG_PATH;
  }
  return path.join(os.homedir(), ".gemini", "config", "mcp_config.json");
}

export function getDefaultMcpBackupPath(configPath = getDefaultMcpConfigPath()) {
  return `${configPath}.voo-backup`;
}

/**
 * Ensures one-time backup of mcp_config.json before VOO modifies it.
 */
export async function ensureMcpConfigBackup(configPath = getDefaultMcpConfigPath()) {
  const backupPath = getDefaultMcpBackupPath(configPath);
  if (fs.existsSync(configPath) && !fs.existsSync(backupPath)) {
    await copyFile(configPath, backupPath);
    return true;
  }
  return false;
}

/**
 * Reads existing mcp_config.json or returns empty default structure.
 */
export async function readMcpConfig(configPath = getDefaultMcpConfigPath()) {
  try {
    const raw = await readFile(configPath, "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
  return { mcpServers: {} };
}

/**
 * Atomically writes data to configPath via temporary file + rename.
 */
export async function writeMcpConfigAtomic(configPath, data) {
  const dir = path.dirname(configPath);
  await mkdir(dir, { recursive: true });
  const tmpPath = `${configPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(tmpPath, content, { mode: 0o600, encoding: "utf8" });
  await rename(tmpPath, configPath);
}

/**
 * Adds or updates the 'voo' entry in mcp_config.json.
 * Preserves all other mcpServers entries and any unknown top-level fields.
 */
export async function addVooMcpServer({
  serverUrl,
  token,
  configPath = getDefaultMcpConfigPath(),
}) {
  await ensureMcpConfigBackup(configPath);
  const data = await readMcpConfig(configPath);
  const mcpServers =
    data.mcpServers && typeof data.mcpServers === "object"
      ? { ...data.mcpServers }
      : {};

  mcpServers.voo = {
    disabled: false,
    url: serverUrl,
    serverUrl,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  };

  const updated = {
    ...data,
    mcpServers,
  };

  await writeMcpConfigAtomic(configPath, updated);
  return { ok: true, config: updated };
}

/**
 * Removes the 'voo' entry from mcp_config.json.
 * Preserves all other mcpServers entries and any unknown top-level fields.
 */
export async function removeVooMcpServer({
  configPath = getDefaultMcpConfigPath(),
} = {}) {
  if (!fs.existsSync(configPath)) return { ok: true, config: null };
  const data = await readMcpConfig(configPath);
  if (!data.mcpServers || !data.mcpServers.voo) {
    return { ok: true, config: data };
  }
  const { voo: _removed, ...remainingServers } = data.mcpServers;
  const updated = {
    ...data,
    mcpServers: remainingServers,
  };
  await writeMcpConfigAtomic(configPath, updated);
  return { ok: true, config: updated };
}
