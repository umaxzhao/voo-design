import { spawn } from "node:child_process";

/** A long-lived Codex app-server connection. Credentials remain owned by Codex. */
export function createCodexConnection({
  bin,
  env = process.env,
  onClose = () => {},
}) {
  const child = spawn(bin, ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...env, NO_COLOR: "1" },
  });
  let buffer = "";
  let nextId = 0;
  let closed = false;
  const pending = new Map();
  const listeners = new Set();
  const send = (frame) => {
    if (closed) throw new Error("cli.connectionClosed");
    child.stdin.write(`${JSON.stringify(frame)}\n`);
  };
  const finish = () => {
    if (closed) return;
    closed = true;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("cli.connectionClosed"));
    }
    pending.clear();
    onClose();
  };
  child.on("error", finish);
  child.on("exit", finish);
  child.stdin.on("error", finish);
  // Drain diagnostics without logging user credentials or conversation content.
  child.stderr.on("data", () => {});
  // Pipe chunks can split a multibyte character in a JSON string. Decode as a
  // stream so Chinese responses and tool arguments retain their original text.
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += String(chunk);
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        finish();
        child.kill();
        return;
      }
      const entry = frame.method ? null : pending.get(frame.id);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(frame.id);
        if (frame.error)
          entry.reject(new Error(frame.error.message || "cli.failed"));
        else entry.resolve(frame.result);
      } else if (frame.method && frame.id != null) {
        // VOO owns canvas approval. Unrelated native requests must not hang or
        // silently authorize filesystem/command operations in the user's home.
        send({
          id: frame.id,
          error: { code: -32601, message: "Unsupported host request" },
        });
      } else if (frame.method) {
        for (const listener of listeners) listener(frame);
      }
    }
  });
  const connection = {
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("cli.requestTimeout"));
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        try {
          send({ id, method, params });
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async initialize() {
      await connection.call("initialize", {
        clientInfo: { name: "voo", version: "1" },
      });
      send({ method: "initialized", params: {} });
    },
    close() {
      finish();
      child.kill();
    },
  };
  return connection;
}
