// Prototype model: frames/hotspots, doc reducers, .voo persistence, panel + runner views.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import {
  addInteraction,
  deserializePrototype,
  frameOfNode,
  frameSubtreeIds,
  hotspotRect,
  interactionsFor,
  interactionsInFrame,
  isFrameNode,
  normalizePrototype,
  prototypeFrames,
  removeInteraction,
  serializePrototype,
  setStartFrame,
  updateInteraction,
} from "../../src/canvas/editor/prototype_model.js";
import { deserialiseDocument, serialiseDocument } from "../../src/canvas/editor/scene_model_serialization.js";
import PrototypeSection from "../../src/canvas/components/editor_properties/prototype_section.jsx";

const frameA = { id: "fa", kind: "group", isFrame: true, x: 0, y: 0, width: 400, height: 300, name: "A" };
const frameB = { id: "fb", kind: "group", isFrame: true, x: 500, y: 0, width: 400, height: 300, name: "B" };
const button = { id: "btn", kind: "rect", x: 40, y: 60, width: 120, height: 40, parentId: "fa", fill: "#ff0000" };
const doc = () => ({ width: 1200, height: 800, nodes: [frameA, frameB, button] });

describe("prototype model", () => {
  it("finds frames, owners and subtrees", () => {
    expect(prototypeFrames(doc()).map((frame) => frame.id)).toEqual(["fa", "fb"]);
    expect(frameOfNode(doc(), button)?.id).toBe("fa");
    expect(frameSubtreeIds(doc(), "fa")).toEqual(["fa", "btn"]);
    expect(isFrameNode(frameA)).toBe(true);
  });

  it("adds, updates and removes interactions", () => {
    const added = addInteraction(doc(), {
      sourceId: "btn",
      action: "navigate",
      targetId: "fb",
      trigger: "click",
    });
    const interaction = added.prototype.interactions[0];
    expect(interactionsFor(added, "btn")).toHaveLength(1);
    const updated = updateInteraction(added, interaction.id, { transition: "dissolve" });
    expect(interactionsFor(updated, "btn")[0].transition).toBe("dissolve");
    expect(removeInteraction(updated, interaction.id).prototype.interactions).toHaveLength(0);
  });

  it("supports overlay and close-overlay actions", () => {
    const overlay = addInteraction(doc(), {
      sourceId: "btn",
      action: "overlay",
      targetId: "fb",
    });
    expect(overlay.prototype.interactions[0]).toMatchObject({
      action: "overlay",
      targetId: "fb",
    });
    const close = addInteraction(overlay, {
      sourceId: "btn",
      action: "closeOverlay",
    });
    expect(close.prototype.interactions).toHaveLength(2);
    expect(close.prototype.interactions[1].action).toBe("closeOverlay");
    expect(
      addInteraction(doc(), { sourceId: "btn", action: "overlay" }),
    ).toEqual(doc());
  });

  it("rejects invalid targets and keeps start frames", () => {
    expect(
      addInteraction(doc(), { sourceId: "btn", action: "navigate", targetId: "nope" }),
    ).toEqual(doc());
    const started = setStartFrame(doc(), "fb");
    expect(started.prototype.startFrameId).toBe("fb");
    expect(normalizePrototype({ startFrameId: "nope" }, doc()).startFrameId).toBeUndefined();
  });

  it("computes frame-relative hotspot rects and frame interactions", () => {
    const model = addInteraction(doc(), {
      sourceId: "btn",
      action: "navigate",
      targetId: "fb",
    });
    const [interaction] = model.prototype.interactions;
    expect(hotspotRect(model, interaction)).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.13333333333333333,
    });
    expect(interactionsInFrame(model, "fa")).toHaveLength(1);
    expect(interactionsInFrame(model, "fb")).toHaveLength(0);
  });

  it("round-trips through .voo serialisation", () => {
    const model = setStartFrame(
      addInteraction(doc(), { sourceId: "btn", action: "navigate", targetId: "fb" }),
      "fa",
    );
    const serialised = serialiseDocument(model);
    expect(serialised.prototype).toMatchObject({ startFrameId: "fa" });
    expect(serialised.prototype.interactions).toHaveLength(1);
    const restored = deserialiseDocument(serialised);
    expect(restored.prototype).toEqual(serialised.prototype);
  });

  it("keeps serialized slices empty when nothing is configured", () => {
    expect(serializePrototype(doc())).toEqual({});
    expect(deserializePrototype({})).toEqual({});
  });
});

describe("prototype panel", () => {
  const engine = (document = doc()) => ({
    getDocument: () => document,
    setDoc: vi.fn(),
  });

  it("renders start-frame toggle, run and add interaction for a frame", () => {
    const html = renderToStaticMarkup(<PrototypeSection object={button} engine={engine()} />);
    expect(html).toContain("editor.props.prototype");
    expect(html).toContain("editor.prototype.addInteraction");
    expect(html).toContain("editor-prototype-empty");
  });

  it("renders existing interaction rows", () => {
    const model = addInteraction(doc(), {
      sourceId: "btn",
      action: "navigate",
      targetId: "fb",
    });
    const html = renderToStaticMarkup(<PrototypeSection object={button} engine={engine(model)} />);
    expect(html).toContain("editor.prototype.trigger");
    expect(html).toContain("editor.prototype.action");
    expect(html).toContain("editor.prototype.transition");
    expect(html).toContain("editor.prototype.target");
  });

  it("returns nothing for a layer outside any frame", () => {
    const loose = { id: "n", kind: "rect", x: 0, y: 0, width: 10, height: 10 };
    const html = renderToStaticMarkup(
      <PrototypeSection object={loose} engine={{ getDocument: () => ({ nodes: [] }), setDoc: vi.fn() }} />,
    );
    expect(html).toBe("");
  });
});
