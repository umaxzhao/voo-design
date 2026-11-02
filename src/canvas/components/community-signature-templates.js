import { createDocument } from "../editor/scene_doc_factory.js";
import { createRectNode as createBaseRectNode, createEllipseNode } from "../editor/scene_model_node_builders.js";
import { createTextNode } from "../editor/scene_model_text_effects.js";
import { DESIGN_SYSTEMS, designSystemColors } from "../design_systems.js";

/** The generic rectangle factory accepts paint geometry; templates add corners explicitly. */
function createRectNode({ cornerRadius = 0, ...options }) {
  return { ...createBaseRectNode(options), ...(cornerRadius ? { cornerRadius } : {}) };
}

function styledText(node, { family, weight, tracking, boxWidth } = {}) {
  if (family) node.fontFamily = family;
  if (weight) node.fontWeight = weight;
  if (tracking !== undefined) node.letterSpacing = tracking;
  if (boxWidth !== undefined) node.boxWidth = boxWidth;
  return node;
}


export function axiomLandingDoc() {
  const system = DESIGN_SYSTEMS.axiom;
  const c = designSystemColors(system);
  const fonts = system.tokens.primitive.fonts;
  const doc = createDocument(1440, 900, c.canvas);
  const nodes = [
    createRectNode({ x: 0, y: 0, width: 1440, height: 900, fill: c.canvas, stroke: "transparent" }),
    // Visible 12-column hairline grid.
    ...[120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200, 1320].map((x) =>
      createRectNode({ x, y: 0, width: 1, height: 900, fill: c.divider, stroke: "transparent" })),
    // Top navigation.
    createRectNode({ x: 0, y: 64, width: 1440, height: 1, fill: c.divider, stroke: "transparent" }),
    styledText(createTextNode({ x: 120, y: 22, text: "AXIOM", fill: c.text, fontSize: 16 }), { family: fonts.heading, weight: 700, tracking: 1 }),
    ...[["INDEX", 560], ["SYSTEMS", 680], ["STUDIO", 800], ["CONTACT", 920]].map(([label, x]) =>
      styledText(createTextNode({ x, y: 26, text: label, fill: c.textMuted, fontSize: 11 }), { family: fonts.label, tracking: 1.2 })),
    createRectNode({ x: 1160, y: 18, width: 160, height: 44, fill: c.action, stroke: "transparent" }),
    styledText(createTextNode({ x: 1190, y: 32, text: "START A PROJECT", fill: c.actionText, fontSize: 11 }), { family: fonts.label, tracking: 0.8 }),
    // Kicker + poster headline.
    styledText(createTextNode({ x: 120, y: 150, text: "01 — DESIGN SYSTEMS FOR TECHNICAL PRODUCTS", fill: c.action, fontSize: 12 }), { family: fonts.label, tracking: 1.4 }),
    styledText(createTextNode({ x: 118, y: 200, text: "SYSTEMS FOR\nTHE NEXT\nDECADE.", fill: c.text, fontSize: 92 }), { family: fonts.heading, weight: 600, tracking: -2, boxWidth: 720 }),
    createRectNode({ x: 120, y: 560, width: 620, height: 1, fill: c.divider, stroke: "transparent" }),
    styledText(createTextNode({ x: 120, y: 590, text: "We build the operating surface for products that cannot look like everyone else. One grid, one signal colour, zero decoration.", fill: c.textMuted, fontSize: 17 }), { family: fonts.body, boxWidth: 520 }),
    createRectNode({ x: 120, y: 720, width: 240, height: 52, fill: c.text, stroke: "transparent" }),
    styledText(createTextNode({ x: 156, y: 738, text: "READ THE PRINCIPLES", fill: c.canvas, fontSize: 12 }), { family: fonts.label, tracking: 0.8 }),
    // Oversized metric anchor on the right.
    styledText(createTextNode({ x: 980, y: 420, text: "92%", fill: c.action, fontSize: 180 }), { family: fonts.heading, weight: 600, tracking: -6 }),
    styledText(createTextNode({ x: 988, y: 640, text: "OF TECHNICAL BUYERS JUDGE THE CONSOLE BEFORE THE MODEL", fill: c.textMuted, fontSize: 11 }), { family: fonts.label, tracking: 1, boxWidth: 320 }),
    // Three feature columns on a rule.
    createRectNode({ x: 120, y: 800, width: 1200, height: 1, fill: c.divider, stroke: "transparent" }),
    ...[["/ 01", "POSITIONING", 120], ["/ 02", "GRID", 520], ["/ 03", "SIGNAL", 920]].flatMap(([index, title, x]) => [
      styledText(createTextNode({ x, y: 818, text: index, fill: c.action, fontSize: 11 }), { family: fonts.label, tracking: 1 }),
      styledText(createTextNode({ x: x + 44, y: 818, text: title, fill: c.text, fontSize: 11 }), { family: fonts.label, tracking: 1 }),
      styledText(createTextNode({ x, y: 846, text: "01 / 03", fill: c.textMuted, fontSize: 11 }), { family: fonts.label, tracking: 1 }),
    ]),
  ];
  doc.nodes = nodes;
  return doc;
}


export function voidOsConsoleDoc() {
  const system = DESIGN_SYSTEMS["void-os"];
  const c = designSystemColors(system);
  const fonts = system.tokens.primitive.fonts;
  const doc = createDocument(1440, 900, c.canvas);
  const mono = (text, x, y, size, fill) =>
    styledText(createTextNode({ x, y, text, fill, fontSize: size }), { family: fonts.label, tracking: 0.4 });
  const nodes = [
    createRectNode({ x: 0, y: 0, width: 1440, height: 900, fill: c.canvas, stroke: "transparent" }),
    // Sidebar.
    createRectNode({ x: 0, y: 0, width: 232, height: 900, fill: c.surface, stroke: c.divider }),
    styledText(createTextNode({ x: 24, y: 24, text: "VOID OS", fill: c.text, fontSize: 18 }), { family: fonts.heading, weight: 600, tracking: 1 }),
    mono("OBSERVABILITY / 04", 24, 52, 10, c.textMuted),
    ...["STATUS", "MESH", "TRACES", "ALERTS", "SETTINGS"].map((label, i) => {
      const active = i === 0;
      return styledText(createTextNode({ x: 24, y: 110 + i * 44, text: active ? `▸ ${label}` : label, fill: active ? c.action : c.textMuted, fontSize: 12 }), { family: fonts.label, tracking: 0.6 });
    }),
    createRectNode({ x: 24, y: 360, width: 184, height: 1, fill: c.divider, stroke: "transparent" }),
    mono("BUILD 2026.10.27", 24, 380, 10, c.textMuted),
    // Top bar + title.
    createRectNode({ x: 232, y: 0, width: 1208, height: 64, fill: c.surface, stroke: c.divider }),
    styledText(createTextNode({ x: 264, y: 22, text: "Cluster Overview", fill: c.text, fontSize: 20 }), { family: fonts.heading, weight: 600 }),
    mono("REGION: FRA-1 / UPTIME 99.982%", 1000, 26, 11, c.textMuted),
    createRectNode({ x: 1360, y: 18, width: 56, height: 28, fill: c.action, stroke: "transparent" }),
    mono("LIVE", 1372, 25, 10, c.actionText),
    // KPI cards.
    ...[["REQUESTS/S", "48.2K", 264], ["P95 LATENCY", "182MS", 664], ["ERROR RATE", "0.02%", 1064]].flatMap(([label, value, x]) => [
      createRectNode({ x, y: 96, width: 340, height: 128, fill: c.surface, stroke: c.divider }),
      mono(label, x + 20, 116, 10, c.textMuted),
      styledText(createTextNode({ x: x + 20, y: 140, text: value, fill: c.text, fontSize: 44 }), { family: fonts.label, weight: 500, tracking: -0.5 }),
      mono("+2.4% / 24H", x + 20, 196, 10, c.action),
    ]),
    // Request chart frame + bars.
    createRectNode({ x: 264, y: 260, width: 736, height: 300, fill: c.surface, stroke: c.divider }),
    mono("REQUESTS — LAST 6H", 284, 280, 10, c.textMuted),
    ...Array.from({ length: 12 }, (_, i) => {
      const height = 40 + ((i * 37) % 150);
      return createRectNode({ x: 300 + i * 56, y: 520 - height, width: 28, height, fill: i % 4 === 0 ? c.action : c.soft, stroke: "transparent" });
    }),
    // Log table.
    createRectNode({ x: 1024, y: 260, width: 392, height: 540, fill: c.surface, stroke: c.divider }),
    mono("RECENT EVENTS", 1044, 280, 10, c.textMuted),
    ...Array.from({ length: 9 }, (_, i) => {
      const y = 310 + i * 52;
      return [
        createRectNode({ x: 1044, y, width: 352, height: 1, fill: c.divider, stroke: "transparent" }),
        createEllipseNode({ x: 1044, y: y + 14, width: 8, height: 8, fill: i === 3 ? c.action : c.textMuted, stroke: "transparent" }),
        mono(["INGEST", "QUERY", "COMPACT", "ALERT", "SYNC"][i % 5], 1064, y + 10, 11, c.text),
        mono(`0x${(4096 + i * 73).toString(16).toUpperCase()}`, 1180, y + 10, 10, c.textMuted),
        mono(`${(12 + i * 7) % 60}ms`, 1330, y + 10, 10, i === 3 ? c.action : c.textMuted),
      ];
    }).flat(),
    mono("STREAM HEALTHY / 6 NODES", 264, 588, 10, c.textMuted),
  ];
  doc.nodes = nodes;
  return doc;
}


export function bloomMobileDoc() {
  const system = DESIGN_SYSTEMS.bloom;
  const c = designSystemColors(system);
  const fonts = system.tokens.primitive.fonts;
  const doc = createDocument(393, 852, c.canvas);
  const nodes = [
    createRectNode({ x: 0, y: 0, width: 393, height: 852, fill: c.canvas, stroke: "transparent" }),
    styledText(createTextNode({ x: 24, y: 24, text: "BLOOM", fill: c.text, fontSize: 13 }), { family: fonts.heading, weight: 700, tracking: 2 }),
    styledText(createTextNode({ x: 325, y: 24, text: "◐", fill: c.text, fontSize: 14 }), { family: fonts.body }),
    // Hero card.
    createRectNode({ x: 24, y: 64, width: 345, height: 300, fill: c.action, stroke: "transparent", cornerRadius: 28 }),
    styledText(createTextNode({ x: 52, y: 100, text: "soft\npop\nsystems", fill: c.actionText, fontSize: 46 }), { family: fonts.heading, weight: 600, tracking: -1, boxWidth: 280 }),
    styledText(createTextNode({ x: 52, y: 286, text: "New drop / 12 pieces", fill: c.actionText, fontSize: 12 }), { family: fonts.body, weight: 600 }),
    createRectNode({ x: 52, y: 312, width: 120, height: 40, fill: c.canvas, stroke: "transparent", cornerRadius: 20 }),
    styledText(createTextNode({ x: 78, y: 324, text: "Explore", fill: c.text, fontSize: 12 }), { family: fonts.body, weight: 700 }),
    // Sticker chip.
    createRectNode({ x: 280, y: 84, width: 64, height: 26, fill: c.text, stroke: "transparent", cornerRadius: 13 }),
    styledText(createTextNode({ x: 292, y: 92, text: "NEW", fill: c.canvas, fontSize: 10 }), { family: fonts.body, weight: 700, tracking: 1 }),
    // Section header.
    styledText(createTextNode({ x: 24, y: 396, text: "Picked for you", fill: c.text, fontSize: 24 }), { family: fonts.heading, weight: 600 }),
    styledText(createTextNode({ x: 300, y: 404, text: "See all", fill: c.action, fontSize: 12 }), { family: fonts.body, weight: 600 }),
    // Product cards.
    ...[0, 1].flatMap((index) => {
      const x = 24 + index * 180;
      return [
        createRectNode({ x, y: 436, width: 165, height: 200, fill: c.surface, stroke: c.divider, cornerRadius: 24 }),
        createEllipseNode({ x: x + 40, y: 466, width: 84, height: 84, fill: index === 0 ? c.soft : c.divider, stroke: "transparent" }),
        styledText(createTextNode({ x: x + 16, y: 566, text: index === 0 ? "Clay lamp" : "Petal mug", fill: c.text, fontSize: 14 }), { family: fonts.body, weight: 700 }),
        styledText(createTextNode({ x: x + 16, y: 590, text: index === 0 ? "$68" : "$32", fill: c.textMuted, fontSize: 12 }), { family: fonts.body }),
      ];
    }),
    // Playful stat strip.
    createRectNode({ x: 24, y: 664, width: 345, height: 72, fill: c.soft, stroke: "transparent", cornerRadius: 20 }),
    styledText(createTextNode({ x: 44, y: 682, text: "4.9", fill: c.text, fontSize: 26 }), { family: fonts.heading, weight: 600 }),
    styledText(createTextNode({ x: 44, y: 712, text: "2.4k reviews", fill: c.textMuted, fontSize: 10 }), { family: fonts.body }),
    styledText(createTextNode({ x: 180, y: 682, text: "48h", fill: c.text, fontSize: 26 }), { family: fonts.heading, weight: 600 }),
    styledText(createTextNode({ x: 180, y: 712, text: "free shipping", fill: c.textMuted, fontSize: 10 }), { family: fonts.body }),
    // Bottom navigation.
    createRectNode({ x: 24, y: 784, width: 345, height: 52, fill: c.text, stroke: "transparent", cornerRadius: 26 }),
    ...[["Home", 60], ["Shop", 165], ["Cart", 270]].map(([label, x]) =>
      styledText(createTextNode({ x, y: 801, text: label, fill: c.canvas, fontSize: 12 }), { family: fonts.body, weight: 600 })),
  ];
  doc.nodes = nodes;
  return doc;
}

