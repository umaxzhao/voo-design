import { createServer } from "node:http";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BRIDGE_VERSION, DEFAULT_PORT, DEFAULT_HOST, MAX_PORT_ATTEMPTS, MODEL_LIST_PATH, CHAT_PATH, BridgeRequestError, warn, log, applyCors, writeJson, writeOpenAiError, readJsonBody, readSelection } from "./bridge-common.js";
import { toDshGenerateOptions } from "./bridge-request.js";
import { failureOf, createCompletionTranslator, collectCompletion } from "./bridge-completion.js";


export function selectionModelIds(models, provider) {
  const list = Array.isArray(models) ? models : [];
  const ids = [];
  for (const entry of list) {
    const id = typeof entry === "string"
      ? entry
      : entry && typeof entry === "object" && typeof entry.id === "string"
        ? entry.id
        : undefined;
    if (id === undefined || id.length === 0 || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}

/**
 * Create the bridge without starting it. `llm` and `selection` are the two
 * Harness services; everything else is injectable for tests.
 */
export function createModelBridge({
  llm,
  selection,
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
  statePath,
  logger = console,
  now = Date.now,
  version = BRIDGE_VERSION,
} = {}) {
  if (!llm || typeof llm.stream !== "function") {
    throw new Error("voo-model-bridge requires the Harness llm service (ctx.llm.stream)");
  }
  let server = null;
  let actualPort = null;
  let closed = false;

  const selectionNow = () => readSelection(selection);

  async function listModelIds() {
    const { provider, model } = selectionNow();
    let models = [];
    try {
      models = await llm.listModels(provider);
    } catch (error) {
      warn(logger, `listModels(${provider}) failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let ids = selectionModelIds(models, provider);
    if (ids.length === 0 && model !== undefined) ids = [model];
    return { provider, model, ids };
  }

  async function resolveChatRoute(body) {
    const requested = typeof body?.model === "string" ? body.model.trim() : "";
    if (requested.length === 0) {
      throw new BridgeRequestError("model is required", { code: "model_not_found" });
    }
    const { provider, model: selected, ids } = await listModelIds();
    if (ids.length > 0 && !ids.includes(requested)) {
      throw new BridgeRequestError(
        `unknown model "${requested}"; available models: ${ids.slice(0, 8).join(", ")}`,
        { status: 400, code: "model_not_found" },
      );
    }
    return { provider, model: requested, selected };
  }

  async function handleModels(res) {
    const { provider, ids } = await listModelIds();
    const data = ids.map((id) => ({ id, object: "model", created: 0, owned_by: provider }));
    writeJson(res, 200, { object: "list", data });
  }

  async function handleHealth(res) {
    const { provider, model } = selectionNow();
    writeJson(res, 200, {
      ok: true,
      provider,
      model: model ?? null,
      port: actualPort,
      pid: process.pid,
      version,
    });
  }

  async function writeStateFile() {
    if (typeof statePath !== "string" || statePath.length === 0) return;
    try {
      const { provider, model, ids } = await listModelIds();
      const payload = {
        url: `http://${host}:${actualPort}/v1`,
        port: actualPort,
        pid: process.pid,
        provider,
        model: model ?? null,
        models: ids,
        version,
        startedAt: new Date(now()).toISOString(),
      };
      await mkdir(path.dirname(statePath), { recursive: true });
      const temporary = `${statePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o644 });
      await rename(temporary, statePath);
    } catch (error) {
      warn(logger, `could not write the bridge description file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function removeStateFile() {
    if (typeof statePath !== "string" || statePath.length === 0) return;
    try {
      const raw = await readFile(statePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed?.pid !== undefined && parsed.pid !== process.pid) return;
    } catch {
      return;
    }
    try {
      await unlink(statePath);
    } catch {
      // The file was already gone.
    }
  }

  async function handleChat(req, res) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      writeOpenAiError(res, error);
      return;
    }
    const { provider, model } = await resolveChatRoute(body);
    const abort = new AbortController();
    res.on("close", () => abort.abort("client disconnected"));
    const options = { ...toDshGenerateOptions(body, { provider, model, logger }), signal: abort.signal };
    let stream;
    try {
      stream = llm.stream(options);
    } catch (error) {
      writeOpenAiError(res, error);
      return;
    }
    const wantsStream = body.stream === true;
    if (!wantsStream) {
      try {
        writeJson(res, 200, await collectCompletion(stream, { model, logger }));
      } catch (error) {
        writeOpenAiError(res, error);
      }
      return;
    }
    let iterator;
    try {
      iterator = stream[Symbol.asyncIterator]();
    } catch (error) {
      writeOpenAiError(res, error);
      return;
    }
    let first;
    try {
      first = await iterator.next();
    } catch (error) {
      writeOpenAiError(res, new BridgeRequestError(
        error instanceof Error ? error.message : String(error),
        { status: 502, type: "server_error", code: "model_error" },
      ));
      return;
    }
    if (!first.done && first.value?.type === "finish" && (first.value.reason?.kind === "error" || first.value.reason?.kind === "aborted")) {
      const failure = failureOf(first.value.reason);
      writeOpenAiError(res, new BridgeRequestError(failure.message, {
        status: first.value.reason.kind === "aborted" ? 499 : 502,
        type: "server_error",
        code: failure.code,
      }));
      return;
    }
    applyCors(res);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const translator = createCompletionTranslator({ model });
    const send = (chunks) => {
      for (const entry of chunks) res.write(`data: ${JSON.stringify(entry)}\n\n`);
    };
    send(translator.start());
    let failed = false;
    try {
      if (!first.done) send(translator.push(first.value));
      for (;;) {
        const next = await iterator.next();
        if (next.done) break;
        send(translator.push(next.value));
      }
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      res.write(`data: ${JSON.stringify({ error: { message, type: "server_error", code: "model_error" } })}\n\n`);
    } finally {
      if (!failed) {
        send(translator.end());
        res.write("data: [DONE]\n\n");
      }
      res.end();
    }
  }

  async function route(req, res) {
    applyCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", `http://${host}`);
    const pathname = url.pathname;
    if (pathname === "/health" || pathname === "/") {
      if (req.method !== "GET") {
        writeJson(res, 405, { error: { message: "method not allowed", type: "invalid_request_error", code: "method_not_allowed" } });
        return;
      }
      await handleHealth(res);
      return;
    }
    if (MODEL_LIST_PATH.has(pathname)) {
      if (req.method !== "GET") {
        writeJson(res, 405, { error: { message: "method not allowed", type: "invalid_request_error", code: "method_not_allowed" } });
        return;
      }
      try {
        await handleModels(res);
      } catch (error) {
        writeOpenAiError(res, error);
      }
      return;
    }
    if (CHAT_PATH.has(pathname)) {
      if (req.method !== "POST") {
        writeJson(res, 405, { error: { message: "method not allowed", type: "invalid_request_error", code: "method_not_allowed" } });
        return;
      }
      try {
        await handleChat(req, res);
      } catch (error) {
        if (!res.headersSent) writeOpenAiError(res, error);
        else res.end();
      }
      return;
    }
    writeJson(res, 404, { error: { message: `not found: ${pathname}`, type: "invalid_request_error", code: "not_found" } });
  }

  function listenOnce(candidatePort) {
    return new Promise((resolve, reject) => {
      const httpServer = createServer((req, res) => {
        route(req, res).catch((error) => {
          if (!res.headersSent) writeOpenAiError(res, error);
          else res.end();
        });
      });
      const onError = (error) => {
        httpServer.removeListener("listening", onListening);
        httpServer.close(() => reject(error));
      };
      const onListening = () => {
        httpServer.removeListener("error", onError);
        httpServer.on("error", (error) => warn(logger, `listener error: ${error instanceof Error ? error.message : String(error)}`));
        const address = httpServer.address();
        const boundPort = address !== null && typeof address === "object" ? address.port : candidatePort;
        resolve({ httpServer, port: boundPort });
      };
      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(candidatePort, host);
    });
  }

  async function start() {
    if (server !== null) return { port: actualPort, url: `http://${host}:${actualPort}/v1` };
    let lastError = null;
    const attempts = port === 0 ? 1 : MAX_PORT_ATTEMPTS;
    for (let offset = 0; offset < attempts; offset += 1) {
      const candidate = port === 0 ? 0 : port + offset;
      try {
        const bound = await listenOnce(candidate);
        server = bound.httpServer;
        actualPort = bound.port;
        closed = false;
        log(logger, `listening on http://${host}:${actualPort}/v1 (pid ${process.pid})`);
        const info = { port: actualPort, url: `http://${host}:${actualPort}/v1` };
        await writeStateFile();
        return info;
      } catch (error) {
        lastError = error;
        if (error?.code !== "EADDRINUSE" || port === 0) throw error;
      }
    }
    throw lastError ?? new Error("could not bind the model bridge port");
  }

  async function close() {
    closed = true;
    await removeStateFile();
    const current = server;
    server = null;
    actualPort = null;
    if (current === null) return;
    await new Promise((resolve) => current.close(() => resolve()));
  }

  return {
    start,
    close,
    get port() {
      return actualPort;
    },
    get closed() {
      return closed;
    },
    get url() {
      return actualPort === null ? null : `http://${host}:${actualPort}/v1`;
    },
    statePath,
  };
}
