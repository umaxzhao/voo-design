import { afterEach, describe, expect, it } from "vitest";
import { ChatGptAdapter } from "../../src/content/adapters/chatgpt.js";
import { imagePrompt, collectGeneratedImages } from "../../src/content/result_collection.js";
import { verifiedSubmit } from "../../src/content/verified-submit.js";
import { el, installDocument } from "./helpers/mini_dom.js";

afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
});

describe("chatgpt turns", () => {
  it("requires login on the auth path and the logged-out button", () => {
    installDocument([], { hostname: "chatgpt.com", pathname: "/auth/login" });
    expect(new ChatGptAdapter().isLoginRequired()).toBe(true);
    installDocument(
      [el("button", { "data-testid": "login-button" })],
      { hostname: "chatgpt.com", pathname: "/" },
    );
    expect(new ChatGptAdapter().isLoginRequired()).toBe(true);
  });

  it("lists assistant turns in document order and skips user turns and nested copies", () => {
    const user = el("div", { "data-turn": "user" }, [
      el("div", { "data-message-author-role": "user" }),
    ]);
    const first = el("div", { "data-turn": "assistant", id: "first" });
    const nestedInner = el("div", { "data-turn": "assistant", id: "inner" });
    const second = el("article", { "data-testid": "conversation-turn-2" }, [nestedInner]);
    installDocument([user, first, second], { hostname: "chatgpt.com", pathname: "/c/1" });
    const turns = new ChatGptAdapter().getAssistantTurns();
    expect(turns.map((turn) => turn.id)).toEqual(["first", ""]);
    expect(turns[1].getAttribute("data-testid")).toBe("conversation-turn-2");
    expect(turns.some((turn) => turn.id === "inner")).toBe(false);
  });

  it("rejects static chrome and keeps a generated image", () => {
    const adapter = new ChatGptAdapter();
    expect(adapter.isResultCandidate(el("img", { src: "https://cdn.oaistatic.com/assets/logo.png" }))).toBe(false);
    expect(adapter.isResultCandidate(el("img", { src: "https://chatgpt.com/favicon.ico" }))).toBe(false);
    expect(adapter.isResultCandidate(el("img", { src: "https://files.oaiusercontent.com/cat.png" }))).toBe(true);
  });

  it("treats a verified submit as failed when the page does not react", async () => {
    const button = el("button", { "data-testid": "send-button" });
    const adapter = {
      getComposer: () => el("textarea", { value: "draw a cat", text: "draw a cat" }),
      getAssistantTurns: () => [],
      isBusy: () => false,
    };
    await expect(
      verifiedSubmit(adapter, button, { waitFor: async () => null }),
    ).rejects.toMatchObject({ code: "webSubmissionUncertain" });
    expect(button.clicked).toBe(1);
  });
});

describe("result collection", () => {
  it("prefixes prompts that do not mention an image", () => {
    expect(imagePrompt("a red bicycle")).toBe("Generate an image: a red bicycle");
    expect(imagePrompt("an image of a bicycle")).toBe("an image of a bicycle");
  });

  it("returns images once they have settled and ignores ones already on the page", async () => {
    let clock = 0;
    let busy = true;
    const fresh = {
      currentSrc: "https://cdn.example/new.png",
      src: "https://cdn.example/new.png",
      naturalWidth: 512,
      naturalHeight: 400,
    };
    const adapter = {
      isBusy: () => busy,
      getAssistantTurns: () => [],
      collectImageElements: () => [fresh],
    };
    const result = await collectGeneratedImages(adapter, {
      known: new Set(["https://cdn.example/old.png"]),
      settleMs: 3000,
      timeoutMs: 20000,
      count: 2,
      sleep: async () => {
        clock += 1000;
        busy = false;
      },
      now: () => clock,
      download: async (url) => `data:image/png;base64,${url}`,
    });
    expect(result.images).toEqual([
      {
        dataUrl: "data:image/png;base64,https://cdn.example/new.png",
        width: 512,
        height: 400,
        mimeType: "image/png",
      },
    ]);
  });

  it("reports noImages when the turn ends with nothing new", async () => {
    let clock = 0;
    const adapter = {
      isBusy: () => false,
      getAssistantTurns: () => [],
      collectImageElements: () => [],
    };
    await expect(
      collectGeneratedImages(adapter, {
        timeoutMs: 1000,
        settleMs: 3000,
        sleep: async () => {
          clock += 500;
        },
        now: () => clock,
      }),
    ).rejects.toMatchObject({ code: "noImages" });
  });
});
