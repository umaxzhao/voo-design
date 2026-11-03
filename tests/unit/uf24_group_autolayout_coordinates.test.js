import { describe, it, expect } from "vitest";
import { buildFigContainer } from "../../src/canvas/figma/voo-to-fig.js";
import { figmaMessageToPages } from "../../src/canvas/figma/figma-to-voo.js";
import { createFigmaExportTemplate } from "../../src/canvas/figma/figma-schema.js";
import { serializeFigArchive, parseFigFile } from "../../src/canvas/figma/fig-file.js";
import { importFigFile } from "../../src/canvas/figma/figma_import_client.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_doc_factory.js";

describe("UF24: Figma ordinary GROUP coordinates and autoLayout roundtrip", () => {
  it("preserves child relative coordinates and autoLayout for ordinary GROUP inside a FRAME", async () => {
    const template = await createFigmaExportTemplate();
    const scene = {
      width: 800,
      height: 600,
      backgroundColor: "#ffffff",
      nodes: [
        {
          id: "frame1",
          kind: NODE_KIND.GROUP,
          isFrame: true,
          name: "ParentFrame",
          x: 60,
          y: 40,
          width: 500,
          height: 400,
          visible: true,
        },
        {
          id: "group1",
          kind: NODE_KIND.GROUP,
          isFrame: false,
          name: "OrdinaryGroup",
          parentId: "frame1",
          x: 100,
          y: 80,
          width: 300,
          height: 200,
          visible: true,
          autoLayout: {
            direction: "vertical",
            gap: 20,
            crossGap: 8,
            padding: { top: 10, right: 15, bottom: 10, left: 15 },
            widthMode: "fixed",
            heightMode: "hug",
            wrap: false,
          },
        },
        {
          id: "rect1",
          kind: NODE_KIND.RECT,
          name: "ChildRect1",
          parentId: "group1",
          x: 100,
          y: 80,
          width: 120,
          height: 60,
          fill: "#ff0000",
          visible: true,
        },
        {
          id: "rect2",
          kind: NODE_KIND.RECT,
          name: "ChildRect2",
          parentId: "group1",
          x: 100,
          y: 160,
          width: 120,
          height: 60,
          fill: "#0000ff",
          visible: true,
        },
      ],
    };

    const container = buildFigContainer(scene, template, { pageName: "Page 1" });

    // Verify raw nodeChanges written for ordinary GROUP
    const groupRecord = container.message.nodeChanges.find((n) => n.name === "OrdinaryGroup");
    expect(groupRecord.type).toBe("GROUP");
    expect(groupRecord.stackMode).toBe("VERTICAL");
    expect(groupRecord.stackSpacing).toBe(20);
    expect(groupRecord.stackHorizontalPadding).toBe(15);
    expect(groupRecord.stackVerticalPadding).toBe(10);
    expect(groupRecord.stackCounterSizing).toBe("FIXED");
    expect(groupRecord.stackPrimarySizing).toBe("RESIZE_TO_FIT");

    const { pages } = figmaMessageToPages(container.message);
    expect(pages.length).toBe(1);
    const roundtripNodes = pages[0].nodes;

    const roundtripGroup = roundtripNodes.find((n) => n.name === "OrdinaryGroup");
    const roundtripRect1 = roundtripNodes.find((n) => n.name === "ChildRect1");
    const roundtripRect2 = roundtripNodes.find((n) => n.name === "ChildRect2");

    expect(roundtripGroup).toBeDefined();
    expect(roundtripGroup.isFrame).toBe(false);

    // AutoLayout verification on ordinary GROUP
    expect(roundtripGroup.autoLayout).toBeDefined();
    expect(roundtripGroup.autoLayout.direction).toBe("vertical");
    expect(roundtripGroup.autoLayout.gap).toBe(20);
    expect(roundtripGroup.autoLayout.padding.left).toBe(15);
    expect(roundtripGroup.autoLayout.widthMode).toBe("fixed");
    expect(roundtripGroup.autoLayout.heightMode).toBe("hug");

    // Relative positions between group and its children must be preserved exactly
    expect(roundtripRect1.x - roundtripGroup.x).toBeCloseTo(0);
    expect(roundtripRect1.y - roundtripGroup.y).toBeCloseTo(0);
    expect(roundtripRect2.x - roundtripGroup.x).toBeCloseTo(0);
    expect(roundtripRect2.y - roundtripGroup.y).toBeCloseTo(80);
  });

  it("preserves child coordinates for standalone ordinary GROUP at canvas root (without parent)", async () => {
    const template = await createFigmaExportTemplate();
    const scene = {
      width: 600,
      height: 400,
      backgroundColor: "#ffffff",
      nodes: [
        {
          id: "rootGroup",
          kind: NODE_KIND.GROUP,
          isFrame: false,
          name: "RootGroup",
          x: 50,
          y: 70,
          width: 250,
          height: 180,
          visible: true,
          autoLayout: {
            direction: "horizontal",
            gap: 12,
            padding: { top: 8, right: 8, bottom: 8, left: 8 },
            widthMode: "hug",
            heightMode: "fixed",
          },
        },
        {
          id: "leaf1",
          kind: NODE_KIND.RECT,
          name: "Leaf1",
          parentId: "rootGroup",
          x: 60,
          y: 80,
          width: 80,
          height: 50,
          fill: "#22bb33",
          visible: true,
        },
        {
          id: "leaf2",
          kind: NODE_KIND.RECT,
          name: "Leaf2",
          parentId: "rootGroup",
          x: 160,
          y: 80,
          width: 80,
          height: 50,
          fill: "#3344cc",
          visible: true,
        },
      ],
    };

    const container = buildFigContainer(scene, template);
    const { pages } = figmaMessageToPages(container.message);
    const nodes = pages[0].nodes;

    const g = nodes.find((n) => n.name === "RootGroup");
    const l1 = nodes.find((n) => n.name === "Leaf1");
    const l2 = nodes.find((n) => n.name === "Leaf2");

    expect(g.autoLayout.direction).toBe("horizontal");
    expect(g.autoLayout.gap).toBe(12);

    expect(l1.x - g.x).toBeCloseTo(10);
    expect(l1.y - g.y).toBeCloseTo(10);
    expect(l2.x - g.x).toBeCloseTo(110);
    expect(l2.y - g.y).toBeCloseTo(10);
  });

  it("preserves coordinates across nested ordinary GROUPS (Group -> Group -> Leaf)", async () => {
    const template = await createFigmaExportTemplate();
    const scene = {
      width: 600,
      height: 400,
      nodes: [
        {
          id: "f",
          kind: NODE_KIND.GROUP,
          isFrame: true,
          name: "OuterFrame",
          x: 10,
          y: 10,
          width: 400,
          height: 300,
          visible: true,
        },
        {
          id: "g1",
          kind: NODE_KIND.GROUP,
          isFrame: false,
          name: "OuterGroup",
          parentId: "f",
          x: 50,
          y: 50,
          width: 300,
          height: 200,
          visible: true,
        },
        {
          id: "g2",
          kind: NODE_KIND.GROUP,
          isFrame: false,
          name: "InnerGroup",
          parentId: "g1",
          x: 80,
          y: 90,
          width: 150,
          height: 100,
          visible: true,
        },
        {
          id: "item",
          kind: NODE_KIND.RECT,
          name: "DeepLeaf",
          parentId: "g2",
          x: 100,
          y: 120,
          width: 50,
          height: 40,
          visible: true,
        },
      ],
    };

    const container = buildFigContainer(scene, template);
    const { pages } = figmaMessageToPages(container.message);
    const nodes = pages[0].nodes;

    const g1 = nodes.find((n) => n.name === "OuterGroup");
    const g2 = nodes.find((n) => n.name === "InnerGroup");
    const item = nodes.find((n) => n.name === "DeepLeaf");

    expect(g2.x - g1.x).toBeCloseTo(30);
    expect(g2.y - g1.y).toBeCloseTo(40);
    expect(item.x - g2.x).toBeCloseTo(20);
    expect(item.y - g2.y).toBeCloseTo(30);
  });

  it("preserves nested FRAME coordinates inside an ordinary GROUP (Group -> Frame -> Leaf)", async () => {
    const template = await createFigmaExportTemplate();
    const scene = {
      width: 600,
      height: 400,
      nodes: [
        {
          id: "groupRoot",
          kind: NODE_KIND.GROUP,
          isFrame: false,
          name: "RootGroup",
          x: 40,
          y: 40,
          width: 300,
          height: 200,
          visible: true,
        },
        {
          id: "nestedFrame",
          kind: NODE_KIND.GROUP,
          isFrame: true,
          name: "NestedFrame",
          parentId: "groupRoot",
          x: 70,
          y: 80,
          width: 200,
          height: 120,
          visible: true,
        },
        {
          id: "nestedLeaf",
          kind: NODE_KIND.RECT,
          name: "NestedLeaf",
          parentId: "nestedFrame",
          x: 90,
          y: 100,
          width: 60,
          height: 40,
          visible: true,
        },
      ],
    };

    const container = buildFigContainer(scene, template);
    const { pages } = figmaMessageToPages(container.message);
    const nodes = pages[0].nodes;

    const g = nodes.find((n) => n.name === "RootGroup");
    const f = nodes.find((n) => n.name === "NestedFrame");
    const leaf = nodes.find((n) => n.name === "NestedLeaf");

    expect(f.x - g.x).toBeCloseTo(30);
    expect(f.y - g.y).toBeCloseTo(40);
    expect(leaf.x - f.x).toBeCloseTo(20);
    expect(leaf.y - f.y).toBeCloseTo(20);
  });

  it("survives real binary serialization and importFigFile full roundtrip", async () => {
    const template = await createFigmaExportTemplate();
    const scene = {
      width: 500,
      height: 400,
      nodes: [
        {
          id: "g",
          kind: NODE_KIND.GROUP,
          isFrame: false,
          name: "ArchiveGroup",
          x: 30,
          y: 30,
          width: 200,
          height: 150,
          autoLayout: { direction: "vertical", gap: 16 },
          visible: true,
        },
        {
          id: "r",
          kind: NODE_KIND.RECT,
          name: "ArchiveRect",
          parentId: "g",
          x: 40,
          y: 50,
          width: 80,
          height: 60,
          fill: "#ffaa00",
          visible: true,
        },
      ],
    };

    const container = buildFigContainer(scene, template, { pageName: "BinaryRoundtrip" });
    const archiveBytes = await serializeFigArchive(container, { name: "BinaryRoundtrip" });

    // Verify it parses via parseFigFile
    const parsed = await parseFigFile(archiveBytes);
    expect(parsed.version).toBe(106);

    // Verify full importFigFile client decode
    const imported = await importFigFile(archiveBytes);
    expect(imported.warnings).toEqual([]);
    const pageNodes = imported.vooFile.document.nodes;
    const importedGroup = pageNodes.find((n) => n.name === "ArchiveGroup");
    const importedRect = pageNodes.find((n) => n.name === "ArchiveRect");

    expect(importedGroup).toBeDefined();
    expect(importedGroup.isFrame).toBe(false);
    expect(importedGroup.autoLayout.direction).toBe("vertical");
    expect(importedGroup.autoLayout.gap).toBe(16);

    expect(importedRect.x - importedGroup.x).toBeCloseTo(10);
    expect(importedRect.y - importedGroup.y).toBeCloseTo(20);
  });
});
