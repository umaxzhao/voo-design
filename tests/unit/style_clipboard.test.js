// Copy/paste appearance and "select same": pure helpers + the engine controller.
import { describe, expect, it, vi } from "vitest";
import {
  SELECT_SAME_CRITERIA,
  copyStyleFrom,
  pasteStyleInto,
  selectSame,
  styleForKind,
} from "../../src/canvas/editor/style_clipboard.js";
import { createEngineStyleController } from "../../src/canvas/editor/editor_engine_styles.js";

const text = {
  id: "t1",
  kind: "text",
  fill: "#112233",
  fontFamily: "Inter",
  fontSize: 24,
  fontWeight: 700,
  lineHeight: 1.2,
  effects: [{ kind: "blur", value: 4 }],
  textCase: "upper",
};
const rect = { id: "r1", kind: "rect", fill: "#112233", stroke: "#000000", strokeWidth: 0 };
const rect2 = { id: "r2", kind: "rect", fill: "#445566", stroke: "#000000", strokeWidth: 0 };

describe("style clipboard", () => {
  it("carries paint and text fields", () => {
    const style = copyStyleFrom(text);
    expect(style).toMatchObject({
      fill: "#112233",
      fontFamily: "Inter",
      fontSize: 24,
      textCase: "upper",
    });
    expect(style.effects[0]).toEqual({ kind: "blur", value: 4 });
  });

  it("drops text fields when pasting onto a rect", () => {
    const style = styleForKind(copyStyleFrom(text), "rect");
    expect(style.fill).toBe("#112233");
    expect(style.fontFamily).toBeUndefined();
    expect(style.textCase).toBeUndefined();
  });

  it("applies the style to every id in one document copy", () => {
    const doc = { nodes: [rect, rect2] };
    const next = pasteStyleInto(doc, ["r1", "r2"], copyStyleFrom(text));
    expect(next.nodes[0].fill).toBe("#112233");
    expect(next.nodes[1].fill).toBe("#112233");
    expect(next.nodes[1].stroke).toBe("#000000");
    expect(doc.nodes[1].fill).toBe("#445566");
  });

  it("selects layers by fill, stroke, font and kind", () => {
    expect(SELECT_SAME_CRITERIA).toEqual(["fill", "stroke", "font", "kind"]);
    const doc = { nodes: [rect, rect2, text] };
    expect(selectSame(doc, rect, "fill")).toEqual(["t1"]);
    expect(selectSame(doc, rect, "stroke")).toEqual(["r2"]);
    expect(selectSame(doc, text, "kind")).toEqual([]);
    const doc2 = { nodes: [text, { ...text, id: "t2" }, rect] };
    expect(selectSame(doc2, text, "font")).toEqual(["t2"]);
  });
});

describe("style engine controller", () => {
  const make = (doc = { nodes: [rect, rect2] }) => {
    let current = doc;
    const selection = { getId: () => "r1", getIds: () => ["r1", "r2"] };
    const selectMany = vi.fn();
    const setDoc = vi.fn((next) => {
      current = next;
    });
    const controller = createEngineStyleController({
      getDoc: () => current,
      setDoc,
      selection,
      selectMany,
      notify: vi.fn(),
      requestRender: vi.fn(),
    });
    return { controller, setDoc, selectMany, get: () => current };
  };

  it("copies and pastes appearance as one history entry", () => {
    const { controller, setDoc, get } = make();
    expect(controller.hasStyleClipboard()).toBe(false);
    expect(controller.copyStyle()).toBe(true);
    expect(controller.hasStyleClipboard()).toBe(true);
    expect(controller.pasteStyle()).toBe(true);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0][1]).toEqual({ name: "editor.history.entry.pasteStyle" });
    expect(get().nodes[1].fill).toBe("#112233");
  });

  it("selects same and reports ids", () => {
    const { controller, selectMany } = make({
      nodes: [rect, { ...rect, id: "r3" }, rect2],
    });
    expect(controller.selectSame("fill")).toEqual(["r1", "r3"]);
    expect(selectMany).toHaveBeenCalledWith(["r1", "r3"]);
    expect(controller.selectSame("kind")).toEqual(["r1", "r3", "r2"]);
  });
});
