/**
 * Document-level round-trips for the wave-2 document features.
 *
 * The per-feature suites (scene_variables, comments_model, auto_layout_reflow)
 * test the pure models. This suite proves the *serialiser wiring*: a `.voo`
 * document that carries variables v2 / comments actually persists and reloads
 * them through `serialiseDocument` → `deserialiseDocument`, and that loading
 * materialises the active variable mode onto bound node properties while
 * keeping every binding id.
 */

import { describe, expect, it } from "vitest";
import {
  createDocument,
} from "../../src/canvas/editor/scene_doc_factory.js";
import {
  deserialiseDocument,
  serialiseDocument,
} from "../../src/canvas/editor/scene_model_serialization.js";
import { createRectNode } from "../../src/canvas/editor/scene_model_node_builders.js";

function makeDoc() {
  const doc = createDocument(800, 600, "#ffffff", { canvasId: "doc-1" });
  const rect = createRectNode({
    x: 10,
    y: 20,
    width: 120,
    height: 80,
    fill: "#ff0000",
  });
  rect.fillVariableId = "var:brand";
  doc.nodes = [rect];
  doc.guides = [{ id: "guide-1", type: "v", pos: 100 }];
  doc.comments = [
    {
      id: "comment-1",
      x: 42,
      y: 24,
      resolved: false,
      createdAt: 1_700_000_000_000,
      author: { id: "user-1", name: "Ada", avatarSeed: "seed-1" },
      messages: [
        {
          id: "message-1",
          author: { id: "user-1", name: "Ada", avatarSeed: "seed-1" },
          body: "Can we align this to the grid?",
          createdAt: 1_700_000_000_001,
        },
      ],
    },
  ];
  doc.variablesV2 = {
    version: 2,
    collections: [
      {
        id: "collection:colors",
        name: "Colors",
        modes: [
          { id: "mode:light", name: "Light" },
          { id: "mode:dark", name: "Dark" },
        ],
        variables: [
          {
            id: "var:brand",
            name: "Brand",
            type: "color",
            valuesByMode: {
              "mode:light": "#ff0000",
              "mode:dark": "#00ff00",
            },
          },
          {
            id: "var:radius",
            name: "Radius",
            type: "number",
            valuesByMode: { "mode:light": 4, "mode:dark": 8 },
          },
        ],
      },
    ],
    activeModeByCollection: { "collection:colors": "mode:dark" },
  };
  doc.nodes[0].cornerRadiusVariableId = "var:radius";
  doc.nodes[0].cornerRadius = 8;
  return doc;
}

describe("document serialisation — wave 2 document data", () => {
  it("round-trips comment threads, guides and variables v2", () => {
    const saved = serialiseDocument(makeDoc());
    expect(saved.comments).toHaveLength(1);
    expect(saved.comments[0].messages[0].body).toBe(
      "Can we align this to the grid?",
    );
    expect(saved.guides).toEqual([{ id: "guide-1", type: "v", pos: 100 }]);
    expect(saved.variablesV2.collections[0].variables).toHaveLength(2);

    const loaded = deserialiseDocument(saved);
    expect(loaded).not.toBeNull();
    expect(loaded.comments).toHaveLength(1);
    expect(loaded.comments[0].author.name).toBe("Ada");
    expect(loaded.guides).toEqual([{ id: "guide-1", type: "v", pos: 100 }]);
    expect(loaded.variablesV2.collections[0].variables).toHaveLength(2);
    expect(loaded.variablesV2.activeModeByCollection["collection:colors"]).toBe(
      "mode:dark",
    );
  });

  it("materialises the active mode onto bound nodes while keeping bindings", () => {
    const loaded = deserialiseDocument(serialiseDocument(makeDoc()));
    const node = loaded.nodes.find((item) => item.id === loaded.nodes[0].id);
    // Dark mode values come from variablesV2.activeModeByCollection.
    expect(node.fillVariableId).toBe("var:brand");
    expect(node.fill).toBe("#00ff00");
    expect(node.cornerRadiusVariableId).toBe("var:radius");
    expect(node.cornerRadius).toBe(8);
  });

  it("migrates legacy v1 colour variables on load and resolves their bindings", () => {
    const legacyDoc = createDocument(400, 300, "transparent", {
      canvasId: "doc-2",
    });
    const rect = createRectNode({
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      fill: "#123456",
    });
    rect.fillVariableId = "brand";
    legacyDoc.nodes = [rect];
    legacyDoc.colorVariables = [
      { id: "brand", name: "Brand", value: "#123456" },
    ];

    // A v1 document has no variablesV2; simulate an older saved record.
    const saved = serialiseDocument(legacyDoc);
    delete saved.variablesV2;
    saved.colorVariables = [{ id: "brand", name: "Brand", value: "#123456" }];

    const loaded = deserialiseDocument(saved);
    expect(loaded.colorVariables).toEqual([
      { id: "brand", name: "Brand", value: "#123456" },
    ]);
    expect(loaded.variablesV2.collections[0].id).toBe("collection:colors");
    expect(loaded.nodes[0].fillVariableId).toBe("brand");
    expect(loaded.nodes[0].fill).toBe("#123456");
  });

  it("does not persist empty comments or an empty variable model", () => {
    const doc = createDocument(100, 100, "transparent", { canvasId: "doc-3" });
    doc.comments = [];
    const saved = serialiseDocument(doc);
    expect(saved.comments).toBeUndefined();
    expect(saved.variablesV2).toBeUndefined();
  });

  it("round-trips named styles and materialises them on load", () => {
    const doc = createDocument(200, 200, "transparent", {
      canvasId: "doc-styles",
    });
    const rect = createRectNode({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fill: "#111111",
    });
    rect.styleIds = { paintId: "style:paint-1" };
    doc.nodes = [rect];
    doc.styles = {
      paint: [
        {
          id: "style:paint-1",
          name: "Brand fill",
          value: { fill: "#ff8800" },
        },
      ],
    };

    const saved = serialiseDocument(doc);
    expect(saved.styles.paint[0].name).toBe("Brand fill");
    expect(saved.nodes[0].styleIds.paintId).toBe("style:paint-1");

    const loaded = deserialiseDocument(saved);
    expect(loaded.styles.paint).toHaveLength(1);
    expect(loaded.nodes[0].styleIds.paintId).toBe("style:paint-1");
    // The style value is materialised onto the bound node on read.
    expect(loaded.nodes[0].fill).toBe("#ff8800");
  });
});
