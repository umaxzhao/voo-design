import { describe, it, expect } from "vitest";
import {
  STYLE_TYPE_KEYS,
  normalizeStyles,
  getStyles,
  listStyles,
  findStyle,
  stylesForNode,
  styleValueFromNode,
  createStyle,
  renameStyle,
  updateStyle,
  deleteStyle,
  applyStyle,
  detachStyle,
  resolveStyleBindings,
  serializeStyles,
  deserializeStyles,
  createStylePanelActions,
} from "../../src/canvas/editor/scene_styles.js";

function rect(id, overrides = {}) {
  return {
    id,
    kind: "rect",
    x: 10,
    y: 20,
    width: 120,
    height: 60,
    fill: "#111111",
    stroke: null,
    strokeWidth: 0,
    ...overrides,
  };
}

function textNode(id, overrides = {}) {
  return {
    id,
    kind: "text",
    x: 0,
    y: 0,
    width: 200,
    height: 40,
    text: "Hello",
    fill: "#222222",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 32,
    fontWeight: "normal",
    italic: false,
    underline: false,
    align: "left",
    letterSpacing: 0,
    lineHeight: 1.25,
    baselineShift: 0,
    direction: "horizontal",
    ...overrides,
  };
}

function groupNode(id, overrides = {}) {
  return { id, kind: "group", x: 0, y: 0, width: 10, height: 10, ...overrides };
}

function regionNode(id, overrides = {}) {
  return { id, kind: "region", x: 0, y: 0, width: 10, height: 10, ...overrides };
}

function makeDoc(nodes = []) {
  return { id: "doc", width: 800, height: 600, nodes };
}

function docWithPaintStyle() {
  let doc = makeDoc([rect("a"), rect("b")]);
  doc = createStyle(doc, { type: "paint", name: "Brand", fromNodeId: "a" });
  return doc;
}

function paintStyleId(doc) {
  return getStyles(doc).paint[0].id;
}

describe("normalizeStyles", () => {
  it("returns an empty library for garbage and never throws", () => {
    for (const input of [null, undefined, [], "x", 42, { paint: "x" }, { paint: [null] }]) {
      expect(() => normalizeStyles(input)).not.toThrow();
      expect(normalizeStyles(input)).toEqual({ paint: [], text: [], effect: [] });
    }
  });

  it("drops duplicates, bad types, invalid values and unknown fields", () => {
    const styles = normalizeStyles({
      paint: [
        { id: "p1", name: "One", value: { fill: "#ffffff", fillOpacity: 2, bogus: 1 } },
        { id: "p1", name: "Dup", value: { fill: "#000000" } },
        { id: "", name: "No id", value: { fill: "#000000" } },
        { id: "empty", name: "Empty", value: {} },
        { id: "bad", name: "Bad", value: "nope" },
      ],
      text: [
        { id: "t1", name: "T", value: { fontSize: "24", align: "middle", lineHeight: 99 } },
      ],
      effect: [
        { id: "e1", name: "E", value: { effects: { shadow: { enabled: true, blur: 4 }, bogus: { a: 1 } } } },
      ],
      unknown: [{ id: "x" }],
    });
    expect(styles.paint).toHaveLength(1);
    expect(styles.paint[0].value).toEqual({ fill: "#ffffff", fillOpacity: 1 });
    expect(styles.text[0].value).toEqual({ fontSize: 24, lineHeight: 3 });
    expect(styles.effect[0].value.effects).toEqual({ shadow: { enabled: true, blur: 4 } });
    expect(styles.unknown).toBeUndefined();
  });
});

describe("createStyle", () => {
  it("captures paint values from a node", () => {
    const doc = makeDoc([
      rect("a", { fill: "#ff0000", fillOpacity: 0.5, stroke: "#00ff00", strokeWidth: 3 }),
    ]);
    const next = createStyle(doc, { type: "paint", name: "Brand", fromNodeId: "a" });
    const [style] = getStyles(next).paint;
    expect(style).toMatchObject({
      name: "Brand",
      value: { fill: "#ff0000", fillOpacity: 0.5, stroke: "#00ff00", strokeWidth: 3 },
    });
    expect(style.id.startsWith("paint:")).toBe(true);
    expect(doc.styles).toBeUndefined();
    // Creating does not apply the style.
    expect(next.nodes[0].styleIds).toBeUndefined();
  });

  it("captures typography from a text node and only known fields", () => {
    const doc = makeDoc([textNode("t", { italic: true, align: "center" })]);
    const next = createStyle(doc, { type: "text", fromNodeId: "t" });
    const value = getStyles(next).text[0].value;
    expect(value).toMatchObject({
      fontSize: 32,
      fontWeight: "normal",
      italic: true,
      align: "center",
      lineHeight: 1.25,
      direction: "horizontal",
    });
    expect(value.text).toBeUndefined();
    expect(value.fill).toBeUndefined();
  });

  it("captures effects from a node", () => {
    const effects = {
      shadow: { enabled: true, color: "#000000", blur: 8, offsetX: 0, offsetY: 2, opacity: 50 },
    };
    const doc = makeDoc([rect("a", { effects })]);
    const next = createStyle(doc, { type: "effect", fromNodeId: "a" });
    expect(getStyles(next).effect[0].value).toEqual({ effects });
  });

  it("accepts an explicit value and defaults the name per type", () => {
    const next = createStyle(makeDoc(), { type: "paint", value: { fill: "#abcdef" } });
    expect(getStyles(next).paint[0]).toMatchObject({
      name: "Paint 1",
      value: { fill: "#abcdef" },
    });
    const second = createStyle(next, { type: "paint", value: { fill: "#123456" } });
    expect(getStyles(second).paint[1].name).toBe("Paint 2");
  });

  it("throws for bad type, bad value, missing node and incompatible node", () => {
    const doc = makeDoc([rect("a"), textNode("t"), groupNode("g")]);
    expect(() => createStyle(doc, { type: "wat", value: { fill: "#fff" } })).toThrow(
      "style-type-invalid",
    );
    expect(() => createStyle(doc, { type: "paint" })).toThrow("style-value-invalid");
    expect(() => createStyle(doc, { type: "paint", fromNodeId: "missing" })).toThrow(
      "style-node-missing",
    );
    expect(() => createStyle(doc, { type: "text", fromNodeId: "a" })).toThrow(
      "style-node-incompatible",
    );
    expect(() => createStyle(doc, { type: "paint", fromNodeId: "g" })).toThrow(
      "style-node-incompatible",
    );
  });
});

describe("rename / update", () => {
  it("renames styles and rejects empty names", () => {
    const doc = docWithPaintStyle();
    const id = paintStyleId(doc);
    const renamed = renameStyle(doc, "paint", id, "Primary");
    expect(getStyles(renamed).paint[0].name).toBe("Primary");
    expect(() => renameStyle(doc, "paint", id, "  ")).toThrow("style-name-invalid");
    expect(() => renameStyle(doc, "paint", "missing", "X")).toThrow("style-missing");
  });

  it("updates from a node and re-materialises every bound node", () => {
    let doc = docWithPaintStyle();
    const id = paintStyleId(doc);
    doc = applyStyle(doc, "a", "paint", id);
    doc = applyStyle(doc, "b", "paint", id);
    // Change the source node and update the style from it.
    doc = {
      ...doc,
      nodes: doc.nodes.map((node) =>
        node.id === "a" ? { ...node, fill: "#ff0000" } : node,
      ),
    };
    const next = updateStyle(doc, "paint", id, { fromNodeId: "a" });
    expect(getStyles(next).paint[0].value.fill).toBe("#ff0000");
    expect(next.nodes.find((node) => node.id === "b").fill).toBe("#ff0000");
    expect(next.nodes.find((node) => node.id === "a").fill).toBe("#ff0000");
  });

  it("updates from an explicit value and validates it", () => {
    const doc = docWithPaintStyle();
    const id = paintStyleId(doc);
    const next = updateStyle(doc, "paint", id, { value: { fill: "#00ff00", strokeWidth: 4 } });
    expect(getStyles(next).paint[0].value).toEqual({ fill: "#00ff00", strokeWidth: 4 });
    expect(() => updateStyle(doc, "paint", id, { value: {} })).toThrow(
      "style-value-invalid",
    );
    expect(() => updateStyle(doc, "paint", id, {})).toThrow("style-value-invalid");
  });
});

describe("apply / detach", () => {
  it("writes paint values and records the style id without touching geometry", () => {
    const doc = docWithPaintStyle();
    const id = paintStyleId(doc);
    const next = applyStyle(doc, "b", "paint", id);
    const node = next.nodes.find((candidate) => candidate.id === "b");
    expect(node).toMatchObject({
      id: "b",
      x: 10,
      y: 20,
      width: 120,
      height: 60,
      fill: "#111111",
      styleIds: { paintId: id },
    });
    expect(node.styleIds.textId).toBeUndefined();
  });

  it("apply(null) and detachStyle clear the id but keep the values", () => {
    const doc = docWithPaintStyle();
    const id = paintStyleId(doc);
    const applied = applyStyle(doc, "b", "paint", id);
    const detached = applyStyle(applied, "b", "paint", null);
    expect(detached.nodes.find((node) => node.id === "b").fill).toBe("#111111");
    expect(detached.nodes.find((node) => node.id === "b").styleIds).toBeUndefined();
    const detached2 = detachStyle(applied, "b", "paint");
    expect(detached2.nodes.find((node) => node.id === "b").styleIds).toBeUndefined();
    // Detaching twice is a no-op identity.
    expect(detachStyle(detached2, "b", "paint")).toBe(detached2);
  });

  it("applying a paint style clears fill/stroke variable bindings", () => {
    let doc = docWithPaintStyle();
    const id = paintStyleId(doc);
    doc = updateStyle(doc, "paint", id, {
      value: { fill: "#111111", stroke: "#00ff00" },
    });
    doc = {
      ...doc,
      nodes: doc.nodes.map((node) =>
        node.id === "b"
          ? { ...node, fillVariableId: "brand", strokeVariableId: "line" }
          : node,
      ),
    };
    const next = applyStyle(doc, "b", "paint", id);
    const node = next.nodes.find((candidate) => candidate.id === "b");
    expect(node.fillVariableId).toBeNull();
    expect(node.strokeVariableId).toBeNull();
  });

  it("applies text styles only to text nodes and paint only to paint-capable nodes", () => {
    let doc = makeDoc([textNode("t"), rect("a"), groupNode("g"), regionNode("r")]);
    doc = createStyle(doc, {
      type: "text",
      value: { fontFamily: "Georgia, serif", fontSize: 20, fontWeight: "bold" },
    });
    const textStyleId = getStyles(doc).text[0].id;
    const next = applyStyle(doc, "t", "text", textStyleId);
    expect(next.nodes.find((node) => node.id === "t")).toMatchObject({
      fontFamily: "Georgia, serif",
      fontSize: 20,
      fontWeight: "bold",
      styleIds: { textId: textStyleId },
    });
    expect(() => applyStyle(doc, "a", "text", textStyleId)).toThrow(
      "style-node-incompatible",
    );
    let paintDoc = createStyle(doc, { type: "paint", value: { fill: "#000000" } });
    const paintId = getStyles(paintDoc).paint[0].id;
    expect(() => applyStyle(paintDoc, "g", "paint", paintId)).toThrow(
      "style-node-incompatible",
    );
    expect(() => applyStyle(paintDoc, "r", "paint", paintId)).toThrow(
      "style-node-incompatible",
    );
  });

  it("applies partial styles without wiping unrelated node properties", () => {
    let doc = makeDoc([
      rect("a", {
        fill: "#111111",
        fillOpacity: 0.4,
        stroke: "#000000",
        strokeWidth: 2,
        opacity: 0.8,
      }),
    ]);
    doc = createStyle(doc, { type: "paint", value: { fill: "#00ff00" } });
    const id = getStyles(doc).paint[0].id;
    const next = applyStyle(doc, "a", "paint", id);
    expect(next.nodes[0]).toMatchObject({
      fill: "#00ff00",
      fillOpacity: 0.4,
      stroke: "#000000",
      strokeWidth: 2,
      opacity: 0.8,
    });
  });

  it("applies effect styles onto node.effects", () => {
    const effects = { glow: { enabled: true, color: "#a7ffd4", blur: 12, spread: 0, opacity: 80 } };
    let doc = makeDoc([rect("a")]);
    doc = createStyle(doc, { type: "effect", value: { effects } });
    const id = getStyles(doc).effect[0].id;
    const next = applyStyle(doc, "a", "effect", id);
    expect(next.nodes[0]).toMatchObject({ effects, styleIds: { effectId: id } });
  });

  it("throws for missing style, node or bad type", () => {
    const doc = docWithPaintStyle();
    expect(() => applyStyle(doc, "a", "paint", "missing")).toThrow("style-missing");
    expect(() => applyStyle(doc, "missing", "paint", paintStyleId(doc))).toThrow(
      "style-node-missing",
    );
    expect(() => applyStyle(doc, "a", "wat", "x")).toThrow("style-type-invalid");
  });
});

describe("delete / resolve", () => {
  it("deleting a style clears node references but keeps applied values", () => {
    let doc = docWithPaintStyle();
    const id = paintStyleId(doc);
    doc = applyStyle(doc, "a", "paint", id);
    const next = deleteStyle(doc, "paint", id);
    expect(getStyles(next).paint).toEqual([]);
    const node = next.nodes.find((candidate) => candidate.id === "a");
    expect(node.fill).toBe("#111111");
    expect(node.styleIds).toBeUndefined();
    expect(() => deleteStyle(next, "paint", id)).toThrow("style-missing");
  });

  it("resolveStyleBindings re-materialises values and clears dangling refs", () => {
    let doc = docWithPaintStyle();
    const id = paintStyleId(doc);
    doc = applyStyle(doc, "a", "paint", id);
    // Simulate a stale node value plus a dangling reference to a missing style.
    doc = {
      ...doc,
      nodes: doc.nodes.map((node) => {
        if (node.id === "a") return { ...node, fill: "#000000" };
        if (node.id === "b") return { ...node, styleIds: { paintId: "gone" }, fill: "#333333" };
        return node;
      }),
    };
    const resolved = resolveStyleBindings(doc);
    expect(resolved.nodes.find((node) => node.id === "a").fill).toBe("#111111");
    const b = resolved.nodes.find((node) => node.id === "b");
    expect(b.fill).toBe("#333333");
    expect(b.styleIds).toBeUndefined();
    // Idempotent: resolving again changes nothing.
    const again = resolveStyleBindings(resolved);
    expect(again).toBe(resolved);
    expect(resolveStyleBindings(again)).toBe(resolved);
  });

  it("is idempotent when the node carries extra properties", () => {
    let doc = makeDoc([rect("a", { fill: "#111111", fillOpacity: 0.4 })]);
    doc = createStyle(doc, { type: "paint", value: { fill: "#111111" } });
    const id = getStyles(doc).paint[0].id;
    doc = applyStyle(doc, "a", "paint", id);
    const resolved = resolveStyleBindings(doc);
    expect(resolved).toBe(doc);
    expect(resolveStyleBindings(resolved)).toBe(resolved);
  });

  it("returns the same document when there is nothing to resolve", () => {
    const doc = makeDoc([rect("a")]);
    expect(resolveStyleBindings(doc)).toBe(doc);
    expect(resolveStyleBindings({ id: "x", nodes: "bad" })).toEqual({ id: "x", nodes: "bad" });
  });
});

describe("queries", () => {
  it("lists and finds styles, and reports the styles of a node", () => {
    let doc = docWithPaintStyle();
    doc = createStyle(doc, { type: "paint", value: { fill: "#00ff00" } });
    const id = paintStyleId(doc);
    expect(listStyles(doc, "paint")).toHaveLength(2);
    expect(listStyles(doc, "wat")).toEqual([]);
    expect(findStyle(doc, "paint", id)).toMatchObject({ id, name: "Brand" });
    expect(findStyle(doc, "paint", "missing")).toBeNull();
    doc = applyStyle(doc, "a", "paint", id);
    const node = doc.nodes.find((candidate) => candidate.id === "a");
    expect(stylesForNode(doc, node).paint).toMatchObject({ id, name: "Brand" });
    expect(stylesForNode(doc, node).text).toBeNull();
    expect(stylesForNode(doc, rect("z")).paint).toBeNull();
    expect(styleValueFromNode(node, "paint").fill).toBe("#111111");
    expect(() => styleValueFromNode(null, "paint")).toThrow("style-node-missing");
    expect(() => styleValueFromNode(node, "wat")).toThrow("style-type-invalid");
  });

  it("exposes the fixed type -> node key mapping", () => {
    expect(STYLE_TYPE_KEYS).toEqual({
      paint: "paintId",
      text: "textId",
      effect: "effectId",
    });
  });
});

describe("serialisation helpers", () => {
  it("round-trips through serializeStyles / deserializeStyles", () => {
    let doc = docWithPaintStyle();
    doc = createStyle(doc, { type: "text", value: { fontSize: 18, align: "right" } });
    doc = applyStyle(doc, "a", "paint", paintStyleId(doc));
    const patch = serializeStyles(doc);
    expect(Object.keys(patch)).toEqual(["styles"]);
    const raw = JSON.parse(JSON.stringify(patch));
    const restored = deserializeStyles(raw);
    expect(restored.styles).toEqual(getStyles(doc));
    // Restoring values onto nodes is a separate explicit step.
    const resolved = resolveStyleBindings({ ...doc, nodes: doc.nodes, styles: restored.styles });
    expect(resolved.nodes.find((node) => node.id === "a").fill).toBe("#111111");
  });

  it("returns {} for documents without styles", () => {
    expect(serializeStyles({ nodes: [] })).toEqual({});
    expect(serializeStyles(null)).toEqual({});
    expect(deserializeStyles({ nodes: [] })).toEqual({});
    expect(deserializeStyles(null)).toEqual({});
  });

  it("normalises a malformed raw styles record", () => {
    const restored = deserializeStyles({
      styles: { paint: [{ id: "p", name: "P", value: { fill: "#ffffff" } }], text: "bad" },
    });
    expect(restored.styles.paint).toHaveLength(1);
    expect(restored.styles.text).toEqual([]);
  });
});

describe("panel action factory", () => {
  function harness(doc, nodeId = "a") {
    let current = doc;
    const commits = [];
    const actions = createStylePanelActions({
      getDocument: () => current,
      commit: (next, options) => {
        commits.push({ next, options });
        current = next;
      },
      getNodeId: () => nodeId,
      historyName: "editor.history.entry.styles",
    });
    return {
      actions,
      commits,
      get current() {
        return current;
      },
    };
  }

  it("commits one document per action with the styles history name", () => {
    const store = harness(makeDoc([rect("a"), rect("b")]));
    store.actions.create("paint", "Brand");
    expect(store.commits).toHaveLength(1);
    expect(store.commits[0].options).toEqual({ name: "editor.history.entry.styles" });
    const id = getStyles(store.current).paint[0].id;

    store.actions.apply("paint", id);
    store.actions.detach("paint");
    const applied = store.actions.apply("paint", id);
    expect(applied).toBeTruthy();
    // Update from the selected node (which currently uses the style).
    store.actions.update("paint", id);
    store.actions.rename("paint", id, "Primary");
    store.actions.delete("paint", id);
    expect(store.commits).toHaveLength(7);
    for (const commit of store.commits.slice(1)) {
      expect(commit.options).toEqual({ name: "editor.history.entry.styles" });
    }
    expect(getStyles(store.current).paint).toEqual([]);
    expect(store.current.nodes.find((node) => node.id === "b").styleIds).toBeUndefined();
  });

  it("creates the style from the selected node and applies it", () => {
    const store = harness(makeDoc([rect("a", { fill: "#abcdef" })]));
    store.actions.create("paint", "Brand");
    const id = getStyles(store.current).paint[0].id;
    store.actions.apply("paint", id);
    expect(store.current.nodes[0]).toMatchObject({
      fill: "#abcdef",
      styleIds: { paintId: id },
    });
  });

  it("does nothing (and does not commit) without a selected node", () => {
    const store = harness(makeDoc([rect("a")]), null);
    expect(store.actions.create("paint", "Brand")).toBeUndefined();
    expect(store.actions.apply("paint", "missing")).toBeUndefined();
    expect(store.actions.detach("paint")).toBeUndefined();
    expect(store.actions.update("paint", "missing")).toBeUndefined();
    expect(store.commits).toEqual([]);
  });

  it("still commits document-level rename/delete actions without a node", () => {
    let current = makeDoc([rect("a")]);
    current = createStyle(current, { type: "paint", name: "Brand", value: { fill: "#111111" } });
    const id = getStyles(current).paint[0].id;
    const commits = [];
    const actions = createStylePanelActions({
      getDocument: () => current,
      commit: (next) => {
        commits.push(next);
        current = next;
      },
      getNodeId: () => null,
      historyName: "editor.history.entry.styles",
    });
    actions.rename("paint", id, "Primary");
    actions.delete("paint", id);
    expect(commits).toHaveLength(2);
    expect(getStyles(current).paint).toEqual([]);
  });
});
