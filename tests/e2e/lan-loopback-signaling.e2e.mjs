import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startLoopbackSignaling } from "../../electron/lan-loopback-signaling.js";

const service = await startLoopbackSignaling();
const browser = await chromium.launch({ headless: true });
try {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [a, b] = await Promise.all(contexts.map(context => context.newPage()));
  const origin = `http://127.0.0.1:${service.port}`;
  await Promise.all([a.goto(origin), b.goto(origin)]);
  async function connect(page, peerId) {
    return page.evaluate(({ origin, peerId, room, token }) => new Promise((resolve, reject) => {
      const socket = new WebSocket(origin.replace("http:", "ws:"));
      window.auditSocket = socket;
      window.auditMessages = [];
      socket.onmessage = event => window.auditMessages.push(JSON.parse(event.data));
      socket.onerror = () => reject(new Error("Loopback socket failed"));
      socket.onopen = () => {
        socket.send(JSON.stringify({ v: 1, t: "join", room, peerId, token }));
        resolve();
      };
    }), { origin, peerId, room: service.room, token: peerId === "first" ? service.hostToken : service.guestToken });
  }
  await connect(a, "first");
  await a.waitForFunction(() => window.auditMessages.some(message => message.t === "roster"));
  await connect(b, "second");
  await b.waitForFunction(() => window.auditMessages.some(message => message.t === "roster"));
  await a.evaluate(() => window.auditSocket.send(JSON.stringify({
    v: 1, t: "signal", to: "second", from: "spoofed", data: { text: '{"t":"cursor"}' },
  })));
  await b.waitForFunction(() => window.auditMessages.some(message => message.t === "signal"));
  const signal = await b.evaluate(() => window.auditMessages.find(message => message.t === "signal"));
  assert.deepEqual(signal, { v: 1, t: "signal", from: "first", to: "second", data: { text: '{"t":"cursor"}' } });
  await Promise.all(contexts.map(context => context.close()));
  console.log(JSON.stringify({ passed: "two isolated browser contexts exchange loopback signaling", address: service.address }));
} finally {
  await browser.close();
  await service.close();
}
