import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MCP_LINK_STORAGE_KEY,
  MCP_LINK_WANTED_EVENT,
  isMcpLinkWanted,
} from "../../src/canvas/mcp/mcp_link_boot.js";
import { startCanvasMcpLink } from "../../src/canvas/mcp/canvas_mcp_link.js";
import { ensureLocalCliBridge, resetWebCliBridge } from "../../src/canvas/components/agent-panel/local_cli_bridge.js";

/** A WebSocket whose connection is always refused. */
function refusedSockets() {
  const sockets = [];
  class RefusedSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = {};
      sockets.push(this);
    }
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    }
    close() {}
    refuse() {
      this.readyState = 3;
      for (const type of ["error", "close"]) for (const fn of this.listeners[type] ?? []) fn({});
    }
  }
  return { RefusedSocket, sockets };
}

describe("web build loopback opt-in", () => {
  beforeEach(() => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("localStorage", (() => {
      const data = new Map();
      return {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key),
      };
    })());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetWebCliBridge();
  });

  it("does not link the page on load without opt-in", () => {
    expect(isMcpLinkWanted({ desktop: false })).toBe(false);
  });

  it("links after the storage switch or a selected local CLI agent, never when switched off", () => {
    localStorage.setItem(MCP_LINK_STORAGE_KEY, "on");
    expect(isMcpLinkWanted({ desktop: false })).toBe(true);
    localStorage.setItem(MCP_LINK_STORAGE_KEY, "off");
    expect(isMcpLinkWanted({ desktop: true })).toBe(false);
    localStorage.removeItem(MCP_LINK_STORAGE_KEY);
    localStorage.setItem("voo.agent.llmProvider", JSON.stringify("codex"));
    expect(isMcpLinkWanted({ desktop: false })).toBe(true);
    localStorage.setItem("voo.agent.llmProvider", JSON.stringify("api:custom"));
    expect(isMcpLinkWanted({ desktop: false })).toBe(false);
  });

  it("keeps the desktop link on by default", () => {
    expect(isMcpLinkWanted({ desktop: true })).toBe(true);
  });

  it("never opens a socket when probing without dial intent", async () => {
    const { RefusedSocket, sockets } = refusedSockets();
    expect(await ensureLocalCliBridge({ dial: false, WebSocketImpl: RefusedSocket })).toBeNull();
    expect(sockets).toHaveLength(0);
  });

  it("announces the opt-in only when a flow dials the bridge", async () => {
    const { RefusedSocket, sockets } = refusedSockets();
    const wanted = vi.fn();
    window.addEventListener(MCP_LINK_WANTED_EVENT, wanted);
    const result = ensureLocalCliBridge({ dial: true, WebSocketImpl: RefusedSocket, url: "ws://127.0.0.1:1" });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0].refuse();
    expect(await result).toBeNull();
    expect(wanted).toHaveBeenCalledTimes(1);
  });
});

describe("failed MCP link connects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retry with growing delay and never call console.error", () => {
    vi.useFakeTimers();
    const { RefusedSocket, sockets } = refusedSockets();
    vi.stubGlobal("WebSocket", RefusedSocket);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const stop = startCanvasMcpLink({ url: "ws://127.0.0.1:1", executeTool: vi.fn(), retryBaseMs: 100, retryMaxMs: 400 });
    // Each socket is refused once, then the clock moves; the next socket appears after the delay.
    const attemptsAfter = (ms) => {
      vi.advanceTimersByTime(ms);
      return sockets.length;
    };
    expect(sockets).toHaveLength(1);
    sockets[0].refuse();
    expect(attemptsAfter(99)).toBe(1);
    expect(attemptsAfter(1)).toBe(2);
    sockets[1].refuse();
    expect(attemptsAfter(199)).toBe(2);
    expect(attemptsAfter(1)).toBe(3);
    sockets[2].refuse();
    expect(attemptsAfter(399)).toBe(3);
    expect(attemptsAfter(1)).toBe(4);
    sockets[3].refuse();
    expect(attemptsAfter(399)).toBe(4); // capped at retryMaxMs
    expect(attemptsAfter(1)).toBe(5);
    stop();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
