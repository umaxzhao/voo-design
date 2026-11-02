/**
 * The local CLI provider: Claude Code / Codex as a text backend.
 *
 * Unlike the other providers there is no HTTP API key — the CLI runs in the
 * desktop main process (launched headless) using the user's own CLI login.
 * `configured` is honest connectivity: it reflects whether the CLI binary is
 * installed, because a provider that always claimed to be ready would be picked
 * first and fail at run time with nothing to fall back on.
 *
 * Desktop-only. In the hosted/extension shells there is no subprocess, so
 * `getProviderConfig` reports not-configured and the picker shows the CLI as
 * unavailable rather than silently routing a job somewhere it cannot run.
 */

import {
  API_MEDIA_TYPE,
  PROVIDER_ID,
  REMOTE_JOB_STATUS,
} from "../providers.js";

/**
 * Whether the CLI can be reached from this shell.
 *
 * The desktop preload exposes `vooDesktop.localCli`; the CLI text bridge lives
 * there. In every other shell it is absent, so the provider is unusable.
 */
function cliBridgeAvailable() {
  return typeof window !== "undefined" && Boolean(window.vooDesktop?.localCli);
}

/** Runs one headless CLI text job and returns the produced text. */
async function runCliText(cliId, model, prompt) {
  const bridge = window.vooDesktop?.localCli;
  if (!bridge?.runText) {
    const error = new Error("cli.desktopOnly");
    error.code = "cli.desktopOnly";
    throw error;
  }
  const result = await bridge.runText(cliId, { prompt, model });
  if (!result?.ok) {
    const error = new Error(result?.code ?? "cli.failed");
    error.code = result?.code ?? "cli.failed";
    error.detail = result?.detail;
    throw error;
  }
  return result.text;
}

export { canonicalizeCliModelId } from "../cli-agents.js";

/** Parses a `cli:model` id into `{ cliId, model }` (e.g. `claude:opus-5`). */
export function parseCliModelId(modelId) {
  const parts = String(modelId ?? "").split(":");
  // A bare id with no colon is not a CLI model — it is an ordinary model id.
  if (parts.length < 2 || !parts[0]) return { cliId: null, model: null };
  const cliId = parts[0];
  const model = parts.slice(1).join(":") || null;
  return { cliId, model };
}

export async function getProviderConfig() {
  const available = cliBridgeAvailable();
  return {
    providerId: PROVIDER_ID.CLI,
    configured: available,
    persistence: "local",
    maskedKey: null,
    error: available ? null : "cli.desktopOnly",
  };
}

export async function saveProviderConfig() {
  return { ok: true };
}

export async function clearProviderConfig() {
  return { ok: true };
}

export async function testProvider() {
  const available = cliBridgeAvailable();
  return { ok: available };
}

export async function listProviderModels({ mediaType } = {}) {
  if (mediaType === API_MEDIA_TYPE.TEXT) {
    const { CLI_TEXT_MODELS } = await import("../providers.js");
    return { models: CLI_TEXT_MODELS };
  }
  return { models: [] };
}

const PENDING = new Map();

export async function submitProviderJob({ mediaType, request } = {}) {
  if (mediaType !== API_MEDIA_TYPE.TEXT) {
    throw new Error("cli.textOnly");
  }
  if (!cliBridgeAvailable()) {
    const error = new Error("cli.desktopOnly");
    error.code = "cli.desktopOnly";
    throw error;
  }
  const taskId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  PENDING.set(taskId, {
    request,
    mediaType,
  });
  return {
    taskId,
    status: REMOTE_JOB_STATUS.PROCESSING,
    submittedAt: Date.now(),
    request,
    mediaType,
  };
}

export async function fetchProviderJob({ taskId }) {
  const parked = PENDING.get(taskId);
  if (!parked) {
    return {
      taskId,
      status: REMOTE_JOB_STATUS.FAILED,
      error: "cli.unknownTask",
    };
  }
  PENDING.delete(taskId);
  const { request } = parked;
  try {
    const modelId = request?.model ?? null;
    const { cliId, model } = parseCliModelId(modelId);
    if (!cliId) {
      return { taskId, status: REMOTE_JOB_STATUS.FAILED, error: "cli.noCliId" };
    }
    const text = await runCliText(cliId, model, request?.prompt ?? "");
    return {
      taskId,
      status: REMOTE_JOB_STATUS.COMPLETED,
      text,
    };
  } catch (error) {
    return {
      taskId,
      status: REMOTE_JOB_STATUS.FAILED,
      error: error?.code ?? "cli.failed",
      detail: error?.detail ?? null,
    };
  }
}

// Alias so the registry's adapt() sees the same shape as the other providers.
export const submitAsrJob = undefined;
export const fetchAsrJob = undefined;
