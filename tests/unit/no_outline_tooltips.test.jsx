import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Force the hint into its "shown" state so the portal content is rendered
// without a DOM: the only state InfoHint owns is the tooltip position.
vi.mock("react", async (original) => ({
  ...(await original()),
  useState: () => [{ top: 0, left: 0 }, vi.fn()],
}));
vi.mock("react-dom", async (original) => ({
  ...(await original()),
  createPortal: (children) => children,
}));

// The portal target is only read, never touched, once createPortal is stubbed.
vi.stubGlobal("document", { body: {} });

const { default: InfoHint } = await import("../../src/canvas/components/info_hint.jsx");
const { WelcomeOpenNotice } = await import(
  "../../src/canvas/components/welcome_dashboard/welcome_open_notice.jsx"
);

/** Returns the class tokens of the first element carrying the given role. */
function classTokensByRole(html, role) {
  const match = html.match(new RegExp(`<[^>]*role="${role}"[^>]*>`));
  expect(match).not.toBeNull();
  const classes = match[0].match(/class="([^"]*)"/);
  expect(classes).not.toBeNull();
  return classes[1].split(/\s+/);
}

describe("floating and inline messages use backgrounds instead of outlines", () => {
  it("InfoHint tooltip has no border class and has a background", () => {
    const html = renderToStaticMarkup(<InfoHint label="Title" text="Explanation" />);
    const tokens = classTokensByRole(html, "tooltip");
    expect(tokens.some((token) => token === "border" || token.startsWith("border-"))).toBe(false);
    expect(tokens.some((token) => token.startsWith("bg-"))).toBe(true);
  });

  it("welcome open notice has no border class and a translucent background", () => {
    const t = (key) => key;
    const html = renderToStaticMarkup(
      <WelcomeOpenNotice t={t} notice={{ key: "welcome.openFailed", reason: "x" }} />,
    );
    const tokens = classTokensByRole(html, "alert");
    expect(tokens.some((token) => token === "border" || token.startsWith("border-"))).toBe(false);
    expect(tokens.some((token) => token.startsWith("bg-") && token.includes("/"))).toBe(true);
  });
});
