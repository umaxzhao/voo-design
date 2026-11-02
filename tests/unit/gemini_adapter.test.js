import { afterEach, describe, expect, it } from "vitest";
import { GeminiAdapter } from "../../src/content/adapters/gemini.js";
import { el, installDocument } from "./helpers/mini_dom.js";

afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
});

function visibleButton(props, children) {
  return el("button", props, children);
}

describe("gemini adapter", () => {
  it("requires login when a sign-in control is up and the account menu is not", () => {
    installDocument(
      [visibleButton({ "aria-label": "Sign in" })],
      { hostname: "gemini.google.com", pathname: "/app" },
    );
    expect(new GeminiAdapter().isLoginRequired()).toBe(true);
  });

  it("does not require login once SignOutOptions is present", () => {
    installDocument(
      [
        el("a", { href: "https://accounts.google.com/SignOutOptions" }),
        visibleButton({ "aria-label": "Sign in" }),
      ],
      { hostname: "gemini.google.com", pathname: "/app" },
    );
    expect(new GeminiAdapter().isLoginRequired()).toBe(false);
  });

  it("requires login on the Google account host", () => {
    installDocument([], { hostname: "accounts.google.com", pathname: "/signin" });
    expect(new GeminiAdapter().isLoginRequired()).toBe(true);
  });

  it("treats the loading indicator and a visible stop control as busy", () => {
    installDocument([
      el("model-response", {}, [el("div", { class: "loading-indicator" })]),
    ]);
    expect(new GeminiAdapter().isBusy()).toBe(true);
  });

  it("drops gstatic and avatar images and keeps generated ones", () => {
    const avatar = el("img", { src: "https://lh3.googleusercontent.com/a/avatar" });
    const chrome = el("img", { src: "https://www.gstatic.com/icon.png" });
    const picture = el("img", { src: "https://lh3.googleusercontent.com/gg/result.png" });
    const adapter = new GeminiAdapter();
    expect(adapter.isResultCandidate(avatar)).toBe(false);
    expect(adapter.isResultCandidate(chrome)).toBe(false);
    expect(adapter.isResultCandidate(picture)).toBe(true);
  });

  it("clicks the visible enabled send button, not a hidden one", () => {
    installDocument([
      visibleButton({ class: "send-button", hidden: true, "aria-label": "Send" }),
      visibleButton({ class: "send-button", "aria-label": "Send message" }),
    ]);
    const button = new GeminiAdapter().getSendButton();
    expect(button.getAttribute("aria-label")).toBe("Send message");
  });
});
