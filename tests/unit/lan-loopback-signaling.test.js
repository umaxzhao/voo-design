import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startLoopbackSignaling } from "../../electron/lan-loopback-signaling.js";

let service;
const opened = socket => new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
const message = socket => new Promise(resolve => {
  socket.once("message", raw => resolve(JSON.parse(String(raw))));
});
const join = (socket, peerId, token) => socket.send(JSON.stringify({ v: 1, t: "join", room: "abcdefgh", peerId, token }));

afterEach(async () => {
  if (service) await service.close();
  service = null;
});

describe("loopback collaboration signaling", () => {
  it("never serves files and only listens on loopback", async () => {
    service = await startLoopbackSignaling({ room: "abcdefgh" });
    expect(service.address).toBe("127.0.0.1");
    for (const path of ["/", "/package.json", "/%2e%2e/package.json", "/etc/passwd"]) {
      const response = await fetch(`http://127.0.0.1:${service.port}${path}`);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    }
  });

  it("introduces peers in one room and derives signal sender from its socket", async () => {
    service = await startLoopbackSignaling({ room: "abcdefgh" });
    const url = `ws://127.0.0.1:${service.port}`;
    const a = new WebSocket(url), b = new WebSocket(url);
    await Promise.all([opened(a), opened(b)]);
    const first = message(a); join(a, "peer-a", service.hostToken);
    expect(await first).toMatchObject({ t: "roster", peers: [] });
    const second = message(b), updated = message(a); join(b, "peer-b", service.guestToken);
    expect(await second).toMatchObject({ t: "roster", peers: ["peer-a"] });
    expect(await updated).toMatchObject({ t: "roster", peers: ["peer-a", "peer-b"] });
    const forwarded = message(b);
    a.send(JSON.stringify({ v: 1, t: "signal", to: "peer-b", from: "spoof", data: { text: '{"t":"cursor"}' } }));
    expect(await forwarded).toMatchObject({ t: "signal", from: "peer-a", to: "peer-b", data: { text: '{"t":"cursor"}' } });
  });

  it("reports occupied ports and releases the listener on close", async () => {
    service = await startLoopbackSignaling();
    await expect(startLoopbackSignaling({ port: service.port })).rejects.toMatchObject({ code: "EADDRINUSE" });
    const port = service.port;
    await service.close(); service = null;
    service = await startLoopbackSignaling({ port });
    expect(service.port).toBe(port);
  });

  it("blocks view-guest writes to another guest while permitting presence", async () => {
    service = await startLoopbackSignaling({ room: "abcdefgh" });
    const url = `ws://127.0.0.1:${service.port}`;
    const host = new WebSocket(url), first = new WebSocket(url), second = new WebSocket(url);
    await Promise.all([opened(host), opened(first), opened(second)]);
    let next = message(host); join(host, "host", service.hostToken); await next;
    next = message(first); let hostRoster = message(host);
    join(first, "first", service.guestToken); await Promise.all([next, hostRoster]);
    next = message(second); hostRoster = message(host); const firstRoster = message(first);
    join(second, "second", service.guestToken); await Promise.all([next, hostRoster, firstRoster]);
    const barrier = message(first);
    host.send(JSON.stringify({ v: 1, t: "access", access: "view" }));
    host.send(JSON.stringify({ v: 1, t: "signal", to: "first", data: { text: '{"t":"cursor","v":1,"peerId":"host"}' } }));
    await barrier;
    const hello = message(second);
    first.send(JSON.stringify({ v: 1, t: "signal", to: "second", data: { text: '{"t":"hello","access":"edit","readOnly":false}' } }));
    expect(JSON.parse((await hello).data.text)).toMatchObject({ access: "view", readOnly: true });
    const delivered = message(second);
    first.send(JSON.stringify({ v: 1, t: "signal", to: "second", data: { text: '{"t":"doc","v":1,"document":{}}' } }));
    first.send(JSON.stringify({ v: 1, t: "signal", to: "second", data: { binary: "AA==" } }));
    first.send(JSON.stringify({ v: 1, t: "signal", to: "second", data: { text: '{"t":"cursor","v":1,"peerId":"first"}' } }));
    expect((await delivered).data.text).toContain('"t":"cursor"');
  });

  it("rejects room admission without its secret", async () => {
    service = await startLoopbackSignaling({ room: "abcdefgh" });
    const url = `ws://127.0.0.1:${service.port}`;
    const host = new WebSocket(url), outsider = new WebSocket(url);
    await Promise.all([opened(host), opened(outsider)]);
    const roster = message(host); join(host, "host", service.hostToken); await roster;
    const closed = new Promise(resolve => outsider.once("close", resolve));
    join(outsider, "outsider", "A".repeat(22));
    expect(await closed).toBe(1008);
  });
});
