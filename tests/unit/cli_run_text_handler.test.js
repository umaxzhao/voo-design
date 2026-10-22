import { describe, it, expect } from "vitest";
import os from "node:os";
import {
  registerLocalCliIpc,
  validateCwd,
  runCodexExec,
  runCodexMcpSession,
} from "../../electron/local_backend_bridge.js";

/** Captures ipcMain.handle registrations so a handler can be called directly. */
function fakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
  };
}

describe("validateCwd", () => {
  it("maps an empty cwd to the home directory", () => {
    expect(validateCwd("")).toEqual({ ok: true, cwd: os.homedir() });
    expect(validateCwd(null)).toEqual({ ok: true, cwd: os.homedir() });
  });

  it("rejects control characters and non-string values", () => {
    expect(validateCwd("/tmp/a\nb").code).toBe("cli.invalidCwd");
    expect(validateCwd(42).code).toBe("cli.invalidCwd");
  });

  it("rejects a path that does not exist", () => {
    expect(validateCwd("/definitely/not/here/voo").code).toBe("cli.cwdNotFound");
  });
});

describe("voo:cli-run-text handler", () => {
  const register = () => {
    const ipcMain = fakeIpcMain();
    registerLocalCliIpc(ipcMain, { isAuthorized: () => true });
    return ipcMain.handlers.get("voo:cli-run-text");
  };

  it("is registered", () => {
    expect(register()).toBeTypeOf("function");
  });

  it("refuses an unauthorized sender", async () => {
    const ipcMain = fakeIpcMain();
    registerLocalCliIpc(ipcMain, { isAuthorized: () => false });
    const handler = ipcMain.handlers.get("voo:cli-run-text");
    const res = await handler({}, "codex", { prompt: "hi" });
    expect(res).toEqual({ ok: false, code: "cli.unauthorizedSender" });
  });

  it("refuses CLIs that do not serve an MCP server", async () => {
    const res = await register()({}, "claude", { prompt: "hi" });
    expect(res).toEqual({ ok: false, code: "cli.mcpUnsupported", detail: "claude" });
  });

  it("refuses an empty prompt before spawning anything", async () => {
    const res = await register()({}, "codex", { prompt: "   " });
    expect(res.ok).toBe(false);
    expect(["cli.emptyPrompt", "cli.notInstalled"]).toContain(res.code);
  });

  it("refuses a model id with shell metacharacters", async () => {
    const res = await register()({}, "codex", { prompt: "hi", model: "gpt;rm" });
    expect(res.ok).toBe(false);
    expect(["cli.invalidModel", "cli.notInstalled"]).toContain(res.code);
  });

  it("handles non-existent binary gracefully in runCodexExec", async () => {
    await expect(
      runCodexExec("/non/existent/bin", { prompt: "hi", cwd: process.cwd() }),
    ).rejects.toThrow();
  });

  it("handles non-existent binary gracefully in runCodexMcpSession", async () => {
    await expect(
      runCodexMcpSession("/non/existent/bin", { prompt: "hi", cwd: process.cwd() }),
    ).rejects.toThrow();
  });
});
