import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import CollabAvatars from "../../src/canvas/components/collab_avatars.jsx";
import { STATUS } from "../../src/canvas/collab/session.js";
import { loadLocale } from "../../src/shared/i18n.js";

beforeAll(async () => {
  await loadLocale("en");
});

describe("CollabAvatars component", () => {
  it("renders with an empty roster", () => {
    const state = {
      status: STATUS.OFF,
      roomId: null,
      peers: [],
    };
    const html = renderToStaticMarkup(
      <CollabAvatars state={state} onStop={() => {}} onIdentity={() => {}} />,
    );
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="Share"');
    expect(html).not.toContain("+");
  });

  it("keeps a 28px no-drag trigger so it works inside the title bar", () => {
    const html = renderToStaticMarkup(
      <CollabAvatars state={{ status: STATUS.OFF, roomId: null, peers: [] }} onStop={() => {}} onIdentity={() => {}} />,
    );
    const trigger = html.match(/<button[^>]*aria-haspopup="dialog"[^>]*>/)[0];
    expect(trigger).toContain("h-7");
    expect(trigger).toContain("-webkit-app-region:no-drag");
  });

  it("renders with two peers in the roster", () => {
    const state = {
      status: STATUS.ACTIVE,
      roomId: "room1234",
      access: "edit",
      peers: [
        {
          peerId: "peer-1",
          name: "Alice",
          colour: "#ff8800",
          self: true,
        },
        {
          peerId: "peer-2",
          name: "Bob",
          colour: "#0088ff",
          self: false,
          transport: "direct",
        },
      ],
    };
    const html = renderToStaticMarkup(
      <CollabAvatars state={state} onStop={() => {}} onIdentity={() => {}} />,
    );
    expect(html).toContain('aria-label="Sharing: click for the link"');
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("background:#ff8800");
    expect(html).toContain("background:#0088ff");
  });

  it("renders with peer overflow when more than four peers join", () => {
    const peers = [
      { peerId: "p1", name: "User 1", colour: "#111" },
      { peerId: "p2", name: "User 2", colour: "#222" },
      { peerId: "p3", name: "User 3", colour: "#333" },
      { peerId: "p4", name: "User 4", colour: "#444" },
      { peerId: "p5", name: "User 5", colour: "#555" },
    ];
    const state = {
      status: STATUS.ACTIVE,
      roomId: "room1234",
      peers,
    };
    const html = renderToStaticMarkup(
      <CollabAvatars state={state} onStop={() => {}} onIdentity={() => {}} />,
    );
    expect(html).toContain("+1");
  });

  it("renders localized strings correctly in Chinese", async () => {
    await loadLocale("zh");
    const state = {
      status: STATUS.OFF,
      roomId: null,
      peers: [],
    };
    const html = renderToStaticMarkup(
      <CollabAvatars state={state} onStop={() => {}} onIdentity={() => {}} />,
    );
    expect(html).toContain('aria-label="分享"');
    await loadLocale("en");
  });
});
