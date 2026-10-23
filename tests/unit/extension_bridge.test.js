import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import ExtensionBridge from "../../electron/extension_bridge.js";
import { DEV_EXTENSION_ID } from "../../src/shared/extension_id.js";
import { LINK } from "../../src/shared/messages.js";

const EXTENSION_ORIGIN = `chrome-extension://${DEV_EXTENSION_ID}`;

async function listen(bridge) {
  bridge.start();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("bridge did not listen")), 2000);
    bridge.server.on("listening", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return bridge.server.address().port;
}

function connect(port, origin) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/`, {
      headers: { Origin: origin },
    });
    socket.once("open", () => resolve(socket));
    socket.once("error", (error) => reject(error));
  });
}

describe("extension bridge", () => {
  const bridges = [];

  afterEach(() => {
    while (bridges.length) bridges.pop().stop();
  });

  it("rejects origins that are not this extension", async () => {
    const bridge = new ExtensionBridge();
    bridges.push(bridge);
    const port = await listen(bridge);
    await expect(connect(port, "https://evil.example")).rejects.toThrow();
    expect(bridge.linked).toBe(false);
  });

  it("accepts the extension origin and resolves an acknowledged job", async () => {
    const bridge = new ExtensionBridge();
    bridges.push(bridge);
    const port = await listen(bridge);
    const socket = await connect(port, EXTENSION_ORIGIN);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bridge.linked).toBe(true);

    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === LINK.JOB) {
        socket.send(JSON.stringify({ type: LINK.ACK, id: message.id, ok: true }));
      }
    });

    await expect(
      bridge.route({
        platform: "chatgpt",
        jobId: "job-1",
        envelope: { method: "chat.generate" },
      }),
    ).resolves.toBeUndefined();
    socket.close();
  });

  it("rejects a job that is not acknowledged in time", async () => {
    const bridge = new ExtensionBridge({ ackTimeoutMs: 40 });
    bridges.push(bridge);
    const port = await listen(bridge);
    const socket = await connect(port, EXTENSION_ORIGIN);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(
      bridge.route({
        platform: "gemini",
        jobId: "job-2",
        envelope: { method: "chat.generate" },
      }),
    ).rejects.toThrow(/extensionAckTimeout/);
    socket.close();
  });
});
