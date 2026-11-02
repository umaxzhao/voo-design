import { describe, expect, it, vi } from "vitest";
import { probeLocalService, createLocalServiceDiscovery } from "../../src/canvas/components/agent-panel/local-service-discovery.js";

const response = (data) => ({ ok: true, json: async () => data });
describe("Local service discovery", () => {
  it("does not mistake an unrelated local HTTP server for VOO", async () => {
    const fetchImpl = vi.fn(async () => response({ ok: true }));
    expect(await probeLocalService({ fetchImpl, url: "ws://127.0.0.1:4179" })).toBe(false);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
    expect(await probeLocalService({ fetchImpl: async () => response({ ok: true, service: "voo-cli-bridge" }) })).toBe(true);
  });
  it("keeps the released 1.0 bridge discoverable but rejects other services and versions", async () => {
    expect(await probeLocalService({ fetchImpl: async () => response({ ok: true, version: "1.0.0" }) })).toBe(true);
    expect(await probeLocalService({ fetchImpl: async () => response({ ok: true, version: "1.0.0", service: "other-app" }) })).toBe(false);
    expect(await probeLocalService({ fetchImpl: async () => response({ ok: true, version: "unknown" }) })).toBe(false);
    const discovery = createLocalServiceDiscovery({ probe: async () => true, native: () => false,
      resolveBridge: async () => ({ checkAll: async () => ({ models: ["unrelated"] }) }) });
    await discovery.refresh();
    expect(discovery.getSnapshot().available).toBe(false);
  });
  it("bounds a hung health request and handles browser permission refusal", async () => {
    expect(await probeLocalService({ fetchImpl: async () => { throw new TypeError("denied"); } })).toBe(false);
    expect(await probeLocalService({ timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) })).toBe(false);
  });
  it("coalesces consumers, hides unavailable services, and rediscovers after restart", async () => {
    let available = false;
    const bridge = { checkAll: vi.fn(async () => ({ claude: { installed: true, authenticated: true } })) };
    const probe = vi.fn(async () => available);
    const discovery = createLocalServiceDiscovery({ probe, resolveBridge: async () => bridge, native: () => false });
    await Promise.all([discovery.refresh(), discovery.refresh()]);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(discovery.getSnapshot().available).toBe(false);
    expect(bridge.checkAll).not.toHaveBeenCalled();
    available = true;
    await discovery.refresh();
    expect(discovery.getSnapshot()).toMatchObject({ available: true, statuses: { claude: { installed: true } } });
    available = false;
    await discovery.refresh();
    expect(discovery.getSnapshot()).toMatchObject({ available: false, statuses: null });
    available = true;
    await discovery.refresh();
    expect(discovery.getSnapshot().available).toBe(true);
  });
  it("cannot publish a probe that finished after the last consumer unsubscribed", async () => {
    let answer;
    const discovery = createLocalServiceDiscovery({ probe: () => new Promise(resolve => { answer = resolve; }), native: () => false });
    const stop = discovery.subscribe(() => {});
    stop();
    answer(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(discovery.getSnapshot().available).toBe(false);
  });
});
