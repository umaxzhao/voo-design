import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Parse the machine-readable `agy --output-format json models` response. */
export function parseAntigravityModels(output) {
  const payload = JSON.parse(output);
  const entries = payload?.command?.data?.models;
  if (!Array.isArray(entries)) {
    throw new Error("Antigravity model response has no command.data.models");
  }

  const seen = new Set();
  return entries.map((entry) => {
    const id = entry?.id;
    if (typeof id !== "string" || !/^[a-zA-Z0-9._-]+$/.test(id)) {
      throw new Error("Antigravity model response contains an invalid id");
    }
    if (seen.has(id)) {
      throw new Error("Antigravity model response contains a duplicate id");
    }
    seen.add(id);
    return {
      id,
      label:
        typeof entry.label === "string" && entry.label.trim()
          ? entry.label.trim()
          : id,
    };
  });
}

/** Query the installed CLI, which applies the current account's model access. */
export async function discoverAntigravityModels(binPath, run = execFileAsync) {
  const { stdout } = await run(binPath, ["--output-format", "json", "models"], {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return parseAntigravityModels(stdout);
}

/** Model lookup failure must not mark a working CLI as unauthenticated. */
export async function antigravityModelStatus(
  binPath,
  discover = discoverAntigravityModels,
) {
  try {
    return { models: await discover(binPath) };
  } catch {
    // Do not forward stderr: provider diagnostics may contain credentials.
    return { modelsError: "cli.modelCapabilitiesUnavailable" };
  }
}
