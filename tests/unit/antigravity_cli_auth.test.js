import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { antigravityArgs } from "../../electron/antigravity_agent_session.js";
import { discoverAntigravityModels } from "../../electron/antigravity_models.js";
import { prepareAntigravityAccountAuth } from "../../electron/antigravity_settings.js";

const temporaryDirectories = [];

async function createSettingsFile(settings) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "voo-agy-auth-"));
  temporaryDirectories.push(directory);
  const settingsPath = path.join(directory, "settings.json");
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return settingsPath;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Antigravity account authentication", () => {
  it("removes only the API-key provider and backs up the original settings", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const settingsPath = await createSettingsFile({
      modelProvider: "gemini",
      theme: "dark",
      permissions: { mode: "ask" },
    });

    const result = await prepareAntigravityAccountAuth({ settingsPath });
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    const backup = JSON.parse(await readFile(result.backupPath, "utf8"));

    expect(result.changed).toBe(true);
    expect(settings).toEqual({ theme: "dark", permissions: { mode: "ask" } });
    expect(backup.modelProvider).toBe("gemini");
  });

  it("keeps Gemini API-key mode when its key is present", async () => {
    vi.stubEnv("GEMINI_API_KEY", "configured-key");
    const settingsPath = await createSettingsFile({ modelProvider: "gemini" });

    const result = await prepareAntigravityAccountAuth({ settingsPath });

    expect(result.changed).toBe(false);
    expect(JSON.parse(await readFile(settingsPath, "utf8"))).toEqual({
      modelProvider: "gemini",
    });
  });

  it("cleans account settings before discovering models without an API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const settingsPath = await createSettingsFile({ modelProvider: "gemini" });
    const run = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ command: { data: { models: [{ id: "gemini-3.8-flash" }] } } }),
    });

    const models = await discoverAntigravityModels("agy", run, settingsPath);

    expect(models).toEqual([{ id: "gemini-3.8-flash", label: "gemini-3.8-flash" }]);
    expect(run.mock.calls[0][1]).toEqual(["--output-format", "json", "models"]);
    expect(JSON.parse(await readFile(settingsPath, "utf8"))).not.toHaveProperty(
      "modelProvider",
    );
  });

  it("does not pass a settings override when launching the account-auth CLI", () => {
    expect(antigravityArgs({ model: "gemini-2.5-pro", effort: "high" })).toEqual([
      "--sandbox",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--model",
      "gemini-3.8-flash-high",
      "--effort",
      "high",
    ]);
  });
});
