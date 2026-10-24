import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import RemoteCursors from "../../src/canvas/components/remote_cursors.jsx";
import { STATUS } from "../../src/canvas/collab/session.js";
import { loadLocale } from "../../src/shared/i18n.js";

beforeAll(async () => {
  await loadLocale("en");
});

describe("RemoteCursors component", () => {
  it("renders nothing when collab session is off", () => {
    const state = {
      status: STATUS.OFF,
      peers: [],
    };
    const html = renderToStaticMarkup(<RemoteCursors state={state} />);
    expect(html).toBe("");
  });

  it("renders nothing when there are no remote peer cursors", () => {
    const state = {
      status: STATUS.ACTIVE,
      peers: [
        {
          peerId: "self-peer",
          name: "Self",
          self: true,
          cursor: { x: 50, y: 50 },
        },
        {
          peerId: "remote-peer",
          name: "Remote",
          self: false,
          cursor: null,
        },
      ],
    };
    const html = renderToStaticMarkup(<RemoteCursors state={state} />);
    expect(html).toBe("");
  });

  it("projects remote cursors with camera zoom and pan", () => {
    const state = {
      status: STATUS.ACTIVE,
      peers: [
        {
          peerId: "peer-remote-1",
          name: "Carol",
          colour: "#a7ffd4",
          self: false,
          cursor: { x: 100, y: 200 },
        },
      ],
    };
    const html = renderToStaticMarkup(
      <RemoteCursors state={state} zoom={1.5} panX={40} panY={60} />,
    );
    expect(html).toContain('data-testid="remote-cursors-layer"');
    expect(html).toContain('data-testid="remote-cursor-peer-remote-1"');
    expect(html).toContain("Carol");
    // 100 * 1.5 + 40 = 190, 200 * 1.5 + 60 = 360
    expect(html).toContain("left:190px");
    expect(html).toContain("top:360px");
    expect(html).toContain('fill="#a7ffd4"');
  });

  it("falls back to guest label when name is not provided", () => {
    const state = {
      status: STATUS.ACTIVE,
      peers: [
        {
          peerId: "peer-anon",
          name: "",
          colour: "#ffffff",
          self: false,
          cursor: { x: 10, y: 20 },
        },
      ],
    };
    const html = renderToStaticMarkup(
      <RemoteCursors state={state} zoom={1} panX={0} panY={0} />,
    );
    expect(html).toContain("Guest");
  });
});
