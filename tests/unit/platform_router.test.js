import { describe, expect, it } from "vitest";
import { handleLinkFrame } from "../../src/content/desktop_link.js";
import { LINK } from "../../src/shared/messages.js";
import { ensurePlatformTab, routePlatformJob, waitForTabLoad } from "../../src/content/platform_router.js";

function fakeTabs(initial = []) {
  const tabs = [...initial];
  let nextId = 10;
  return {
    tabs,
    async query({ url }) {
      const prefix = url.endsWith("*") ? url.slice(0, -1) : url;
      return tabs.filter((tab) => tab.url.startsWith(prefix));
    },
    async update(id, patch) {
      const tab = tabs.find((item) => item.id === id);
      Object.assign(tab, patch);
      return tab;
    },
    async create({ url, active }) {
      const tab = { id: nextId, url, active };
      nextId += 1;
      tabs.push(tab);
      return tab;
    },
    async sendMessage(id, message) {
      const tab = tabs.find((item) => item.id === id);
      tab.messages = tab.messages || [];
      tab.messages.push(message);
      return { ok: true };
    },
  };
}

describe("platform router", () => {
  it("reuses an open ChatGPT tab instead of creating another", async () => {
    const tabs = fakeTabs([{ id: 3, url: "https://chatgpt.com/c/abc" }]);
    const found = await ensurePlatformTab(tabs, "chatgpt");
    expect(found).toEqual({ tabId: 3, created: false });
    expect(tabs.tabs).toHaveLength(1);
  });

  it("opens Gemini when no tab exists and delivers the job", async () => {
    const tabs = fakeTabs();
    const reply = await routePlatformJob(
      {
        platform: "gemini",
        jobId: "job-7",
        envelope: { method: "chat.generate", payload: { prompt: "a lamp" } },
      },
      tabs,
    );
    expect(reply.ok).toBe(true);
    expect(tabs.tabs[0].url).toBe("https://gemini.google.com/app");
    expect(tabs.tabs[0].messages[0].jobId).toBe("job-7");
  });

  it("waits until a new tab finishes loading before delivering", async () => {
    const tabs = fakeTabs();
    let reads = 0;
    tabs.get = async (id) => {
      const tab = tabs.tabs.find((item) => item.id === id);
      reads += 1;
      tab.status = reads < 3 ? "loading" : "complete";
      return tab;
    };
    let clock = 0;
    await waitForTabLoad(tabs, (await tabs.create({ url: "https://chatgpt.com/", active: true })).id, {
      sleep: async () => {},
      now: () => {
        clock += 100;
        return clock;
      },
    });
    expect(reads).toBeGreaterThanOrEqual(3);
  });

  it("acks a link.job and pongs a ping", async () => {
    const sent = [];
    const jobs = [];
    await handleLinkFrame(
      { type: LINK.JOB, id: 4, platform: "chatgpt", jobId: "j", envelope: { method: "chat.generate" } },
      {
        send: (message) => sent.push(message),
        routeJob: async (frame) => jobs.push(frame.jobId),
      },
    );
    await handleLinkFrame({ type: LINK.PING }, { send: (message) => sent.push(message) });
    expect(jobs).toEqual(["j"]);
    expect(sent).toEqual([
      { type: LINK.ACK, id: 4, ok: true },
      { type: LINK.PONG },
    ]);
  });
});
