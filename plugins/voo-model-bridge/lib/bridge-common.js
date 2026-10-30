import { homedir } from "node:os";
import path from "node:path";


export const name = "voo-model-bridge";


export const BRIDGE_VERSION = "1.0.0";


export const DEFAULT_PORT = 4399;


export const DEFAULT_PROVIDER = "deepseek-official";


export const DEFAULT_HOST = "127.0.0.1";


export const STATE_FILE_NAME = "voo-model-bridge.json";


export const MAX_BODY_BYTES = 64 * 1024 * 1024;


export const MAX_PORT_ATTEMPTS = 20;


export const CORS_HEADERS = Object.freeze({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-max-age": "600",
});


export const MODEL_LIST_PATH = new Set(["/v1/models", "/models"]);


export const CHAT_PATH = new Set(["/v1/chat/completions", "/chat/completions"]);

/** OpenAI-shaped request failure carrying the HTTP status to answer with. */
export class BridgeRequestError extends Error {
  constructor(message, { status = 400, type = "invalid_request_error", code = "invalid_request" } = {}) {
    super(message);
    this.name = "BridgeRequestError";
    this.status = status;
    this.type = type;
    this.code = code;
  }
}


export function warn(logger, message) {
  try {
    (logger?.warn ?? logger?.error ?? (() => {}))(`[voo-model-bridge] ${message}`);
  } catch {
    // Logging must never break a request.
  }
}


export function log(logger, message) {
  try {
    (logger?.log ?? logger?.info ?? (() => {}))(`[voo-model-bridge] ${message}`);
  } catch {
    // Logging must never break a request.
  }
}


export function applyCors(res) {
  for (const [header, value] of Object.entries(CORS_HEADERS)) res.setHeader(header, value);
}


export function writeJson(res, status, body) {
  applyCors(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}


export function writeOpenAiError(res, error) {
  const bridgeError = error instanceof BridgeRequestError
    ? error
    : new BridgeRequestError(
      error instanceof Error ? error.message : String(error),
      { status: 500, type: "server_error", code: "internal_error" },
    );
  writeJson(res, bridgeError.status, {
    error: { message: bridgeError.message, type: bridgeError.type, code: bridgeError.code },
  });
}

/** Read and parse a JSON body, refusing one larger than the configured bound. */
export async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  const chunks = [];
  let total = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      tooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) {
    throw new BridgeRequestError(`request body exceeds ${limit} bytes`, {
      status: 413,
      code: "request_too_large",
    });
  }
  if (chunks.length === 0) return {};
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BridgeRequestError("request body is not valid JSON", { code: "invalid_json" });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BridgeRequestError("request body must be a JSON object", { code: "invalid_json" });
  }
  return parsed;
}

/** Resolve the bridge settings from plugin config, environment, and defaults. */
export function resolveBridgeSettings(config = {}, env = process.env, home = homedir()) {
  const rawPort = env.VOO_MODEL_BRIDGE_PORT ?? config?.port ?? DEFAULT_PORT;
  const parsedPort = Number(rawPort);
  const port = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : DEFAULT_PORT;
  const stateDirectory = typeof env.VOO_MODEL_BRIDGE_STATE_DIR === "string" && env.VOO_MODEL_BRIDGE_STATE_DIR.length > 0
    ? env.VOO_MODEL_BRIDGE_STATE_DIR
    : path.join(home, ".dsh");
  const statePath = typeof env.VOO_MODEL_BRIDGE_STATE === "string" && env.VOO_MODEL_BRIDGE_STATE.length > 0
    ? env.VOO_MODEL_BRIDGE_STATE
    : path.join(stateDirectory, STATE_FILE_NAME);
  return { port, host: DEFAULT_HOST, statePath, stateDirectory };
}

/** Read the profile's current default model selection, falling back to a neutral route. */
export function readSelection(selection) {
  try {
    const current = selection?.currentSelection?.();
    if (current && typeof current.provider === "string" && current.provider.length > 0) {
      return {
        provider: current.provider,
        model: typeof current.model === "string" && current.model.length > 0 ? current.model : undefined,
      };
    }
  } catch {
    // A missing selection service must not prevent the bridge from serving.
  }
  return { provider: DEFAULT_PROVIDER, model: undefined };
}
