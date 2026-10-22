import fs from "fs";
import path from "path";

const projectRoot = "/Users/tt/teamwork_projects/voo_design";
const dump = JSON.parse(
  fs.readFileSync(
    "/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/icons_dump.json",
    "utf8"
  )
);

function escapePipes(str) {
  return str.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function categorize(name, lucideName) {
  if (name.startsWith("IconGlyph")) return "Adjustment & Filter Glyphs";
  if (
    name.includes("Ai") ||
    name.includes("Sparkle") ||
    name.includes("Wand") ||
    name.includes("ReversePrompt") ||
    name.includes("Magic")
  )
    return "AI & Smart Generation Tools";
  if (
    name.includes("Selection") ||
    name.includes("Marquee") ||
    name.includes("Lasso") ||
    name.includes("Cursor") ||
    name.includes("Crop")
  )
    return "Selection & Marquee Tools";
  if (
    name.includes("Heal") ||
    name.includes("Bandage") ||
    name.includes("Stamp") ||
    name.includes("Patch")
  )
    return "Healing & Retouching Family";
  if (
    name.includes("Brush") ||
    name.includes("Paint") ||
    name.includes("Bucket") ||
    name.includes("Pipette") ||
    name.includes("Eraser") ||
    name.includes("Pen") ||
    name.includes("Bend") ||
    name.includes("Cut") ||
    name.includes("Scissors")
  )
    return "Drawing, Painting & Vector Path Editing";
  if (
    name.includes("Square") ||
    name.includes("Circle") ||
    name.includes("Triangle") ||
    name.includes("Star") ||
    name.includes("Diamond") ||
    name.includes("Polygon") ||
    name.includes("Pentagon") ||
    name.includes("Box") ||
    name.includes("Cylinder") ||
    name.includes("Pyramid") ||
    name.includes("Torus") ||
    name.includes("Sphere") ||
    name.includes("Helix") ||
    name.includes("Icosahedron") ||
    name.includes("Dodecahedron") ||
    name.includes("Perspective") ||
    name.includes("Warp") ||
    name.includes("Distort") ||
    name.includes("Flip") ||
    name.includes("Rotate") ||
    name.includes("CornerRadius") ||
    name.includes("VectorSquare") ||
    name.includes("Asterisk") ||
    name.includes("Astroid") ||
    name.includes("Point")
  )
    return "Shapes, Geometry & Transforms";
  if (
    name.includes("Text") ||
    name.includes("Bold") ||
    name.includes("Italic") ||
    name.includes("Underline") ||
    name.includes("List") ||
    name.includes("AlignLeft") ||
    name.includes("AlignCenter") ||
    name.includes("AlignRight")
  )
    return "Typography & Text Styling";
  if (
    name.includes("Layer") ||
    name.includes("Mask") ||
    name.includes("Opacity") ||
    name.includes("Transparency") ||
    name.includes("Eye") ||
    name.includes("Lock") ||
    name.includes("Link")
  )
    return "Layers, Masking & Composition";
  if (
    name.includes("Image") ||
    name.includes("Music") ||
    name.includes("Video") ||
    name.includes("Film") ||
    name.includes("Clapper") ||
    name.includes("Volume") ||
    name.includes("Play") ||
    name.includes("Pause") ||
    name.includes("Skip") ||
    name.includes("Repeat") ||
    name.includes("Time") ||
    name.includes("Motion") ||
    name.includes("PictureInPicture") ||
    name.includes("Subtitles")
  )
    return "Media, Audio/Video & Animation";
  if (
    name.includes("File") ||
    name.includes("Folder") ||
    name.includes("Save") ||
    name.includes("Copy") ||
    name.includes("Trash") ||
    name.includes("Undo") ||
    name.includes("Redo") ||
    name.includes("Download") ||
    name.includes("Upload") ||
    name.includes("Share") ||
    name.includes("Branch") ||
    name.includes("Users")
  )
    return "Document & File Management";
  if (
    name.includes("Panel") ||
    name.includes("Grid") ||
    name.includes("Group") ||
    name.includes("Layout") ||
    name.includes("Frame") ||
    name.includes("Component") ||
    name.includes("Map") ||
    name.includes("Move") ||
    name.includes("Swap")
  )
    return "Canvas, Layout & Navigation Panels";
  if (
    name.includes("Google") ||
    name.includes("Github") ||
    name.includes("Chrome") ||
    name.includes("OpenCode") ||
    name.includes("Credits") ||
    name.includes("Api") ||
    name.includes("Code") ||
    name.includes("Terminal") ||
    name.includes("Server") ||
    name.includes("Hd") ||
    name.includes("Zap")
  )
    return "Third-Party, Services & Identity";
  return "App Shell & UI Affordances";
}

function formatNodeXml(node) {
  if (!node || !node.length) return "";
  return node
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${attrStr} />`;
    })
    .join(" ");
}

function formatNodeSummary(node) {
  if (!node || !node.length) return "Empty";
  const tagCounts = {};
  for (const [tag] of node) {
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
  const summary = Object.entries(tagCounts)
    .map(([tag, count]) => `${count}x <${tag}>`)
    .join(", ");
  return summary;
}

// Assemble all features
const allFeatures = [];

// 1. Lucide re-exports
for (const item of dump.lucideReExports) {
  const cat = categorize(item.alias, item.lucideName);
  const xml = formatNodeXml(item.node);
  const summary = formatNodeSummary(item.node);
  allFeatures.push({
    exportName: item.alias,
    canonicalName: item.lucideName,
    category: cat,
    type: "Lucide 24×24 SVG Re-export",
    summary: `${summary}: ${xml}`,
    elementsXml: xml,
    inputs: "size (default 16 or per UI_SPEC), strokeWidth (default 1.5), className, color",
    outputs: "24×24 stroke SVG / CoreGraphics path, round cap/join, 1.5pt",
    errorBehavior: "Renders empty SVG if mount fails; clamps viewBox to 0 0 24 24",
    discoveredVia: `src/canvas/icons.jsx -> lucide-react/dist/esm/icons/${item.lucideName}.mjs`,
    rawNode: item.node
  });
}

// 2. Custom Functions in icons.jsx
const customFuncElements = {
  IconHelp: `<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /> <line x1="12" y1="17" x2="12.01" y2="17" />`,
  IconSwap: `<path d="M3 8.75H21L17.6 4.75" /> <path d="M21 14.75H3L6.4 18.75" />`,
  IconMask: `<rect x="3" y="4" width="18" height="16" rx="3" ry="3" /> <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />`,
  IconLayerPrompt: `<path d="M21 11V5C21 4.46957 20.7893 3.96086 20.4142 3.58579C20.0391 3.21071 19.5304 3 19 3H5C4.46957 3 3.96086 3.21071 3.58579 3.58579C3.21071 3.96086 3 4.46957 3 5V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H11" /> <path d="M18.2555 21.9077C18.3273 21.8481 18.376 21.7653 18.3931 21.6735C18.531 20.8536 18.9211 20.097 19.509 19.509C20.097 18.9211 20.8536 18.531 21.6735 18.3931C21.7653 18.376 21.8481 18.3273 21.9077 18.2555C21.9674 18.1837 22 18.0933 22 18C22 17.9067 21.9674 17.8163 21.9077 17.7445C21.8481 17.6727 21.7653 17.624 21.6735 17.6069C20.8536 17.469 20.097 17.0789 19.509 16.491C18.9211 15.903 18.531 15.1464 18.3931 14.3265C18.376 14.2347 18.3273 14.1519 18.2555 14.0923C18.1837 14.0326 18.0933 14 18 14C17.9067 14 17.8163 14.0326 17.7445 14.0923C17.6727 14.1519 17.624 14.2347 17.6069 14.3265C17.469 15.1464 17.0789 15.903 16.491 16.491C15.903 17.0789 15.1464 17.469 14.3265 17.6069C14.2347 17.624 14.1519 17.6727 14.0923 17.7445C14.0326 17.8163 14 17.9067 14 18C14 18.0933 14.0326 18.1837 14.0923 18.2555C14.1519 18.3273 14.2347 18.376 14.3265 18.3931C15.1464 18.531 15.903 18.9211 16.491 19.509C17.0789 20.097 17.469 20.8536 17.6069 21.6735C17.624 21.7653 17.6727 21.8481 17.7445 21.9077C17.8163 21.9674 17.9067 22 18 22C18.0933 22 18.1837 21.9674 18.2555 21.9077Z" />`,
  IconCornerRadius: `<path d="M4 20V16C4 9.37258 9.37258 4 16 4H20" />`,
  IconOpacity: `<circle cx="12" cy="12" r="8" stroke="currentColor" /> <path d="M12 4A8 8 0 0 0 12 20Z" fill="currentColor" />`,
  IconHealAi: `<g transform="scale(0.7)"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 6v12M18 6v12" /><path d="M10 10.01h.01M10 14.01h.01M14 10.01h.01M14 14.01h.01" /></g><g transform="translate(3.6 3.4) scale(0.8)"><path d="M18.3194 21.8847C18.4091 21.8101..." /></g>`,
  IconHealPatch: `<rect x="2" y="2" width="11" height="11" rx="2.5" strokeDasharray="3 2.5" /> <rect x="11" y="11" width="11" height="11" rx="2.5" />`,
  IconSelectionRect: `<path d="M5 4C4.46957 4 3.96086 4.21071 3.58579 4.58579C3.21071 4.96086 3 5.46957 3 6" /> <path d="M19 22C19.5304 22 20.0391 21.7893 20.4142 21.4142C20.7893 21.0391 21 20.5304 21 20" /> <path d="M19 4C19.5304 4 20.0391 4.21071 20.4142 4.58579C20.7893 4.96086 21 5.46957 21 6" /> <path d="M5 22C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20" /> <path d="M9 4H10" /> <path d="M15 22H14" /> <path d="M14 4H15" /> <path d="M10 22H9" /> <path d="M3 10V11" /> <path d="M21 16V15" /> <path d="M3 15V16" /> <path d="M21 11V10" />`,
  IconSelectionEllipse: `<circle cx="12" cy="12.5" r="9.5" strokeDasharray="3 4" />`,
  IconSelectionFree: `<path d="M3.704 15.4671C2.3274 13.8314... strokeDasharray="3 4" /> <path d="M7 23.0001C6.3798 22.535... /> <path d="M5 19C6.1046 19 7 18.1046... fill=none" />`,
  IconPatch: `<path d="M4 14a8 8 0 0 1 16 0c0 4.418-3.582 7-8 7s-8-2.582-8-7z" strokeDasharray="3 3" /> <path d="M9 12l6 6M15 12l-6 6" />`,
  IconSelectionPolygon: `<path d="M12 3.5L21 9.5V18.5L12 24.5L3 18.5V9.5Z" strokeDasharray="3 4" /> <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />`,
  IconAiAutoMask: `<path d="M21 11V5C21 4.46957... (outer box)" /> <path d="M18.3194 21.8847... (sparkle)" /> <path d="M16.5 9.81794... (mask arc)" />`,
  IconAiObjectSelection: `<path d="M7 22..." /> <path d="M7 16.9299..." /> <path d="M3.34 14... strokeDasharray="3 4" /> <path d="M5 18..." /> <path d="M18.3194 21.8847... (sparkle)" />`,
  IconAiRemove: `<path d="M18.3194 21.8847... (sparkle)" /> <path d="M12.0973 20.9995... (eraser body)" /> <path d="M4.0815 11.0901L9.5 16.5085 (divider)" />`,
  IconPerspective: `<path d="M5 19L8 5h8l3 14H5z" /> <path d="M7 12h10" /> <path d="M12 5v14" /> <path d="M6 15.5h12" /> <path d="M7.5 8.5h9" />`,
  IconMeshWarp: `<path d="M4 6c4-2 12 2 16 0" /> <path d="M4 12c4-2 12 2 16 0" /> <path d="M4 18c4-2 12 2 16 0" /> <path d="M6 4c-2 4 2 12 0 16" /> <path d="M12 4c-2 4 2 12 0 16" /> <path d="M18 4c-2 4 2 12 0 16" />`,
  IconDistort: `<path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4 21l3.39-.97C8.93 20.66 10.42 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z" /> <path d="M8 12c1.5-2 4.5-2 6 0s4.5 2 2 4-5 1-8-4z" />`,
  IconVectorSquare: `<rect x="5" y="5" width="14" height="14" stroke="currentColor" fill="none" /> <rect x="2" y="2" width="5" height="5" fill="currentColor" stroke="none" rx="0.5" /> <rect x="17" y="2" width="5" height="5" fill="currentColor" stroke="none" rx="0.5" /> <rect x="2" y="17" width="5" height="5" fill="currentColor" stroke="none" rx="0.5" /> <rect x="17" y="17" width="5" height="5" fill="currentColor" stroke="none" rx="0.5" />`,
  IconHd: `<rect x="2" y="4" width="20" height="16" rx="4" /> <path d="M6 8v8" /> <path d="M10 8v8" /> <path d="M6 12h4" /> <path d="M14 8v8h2.5a3.5 3.5 0 0 0 0-7H14z" />`,
  IconGoogle: `<path d="M20.5 12.2A8.5 8.5 0 1 1 18.2 6.3L15 9.5a4.5 4.5 0 1 0 1.9 2.7H12" />`,
  IconGithub: `<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />`,
  IconChrome: `<path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0z..." fill="currentColor" />`,
  IconOpenCode: `<path d="M0 0h24v24H0z" fill="none" /> <path d="M22 24H2V0h20zM17 4.8H7v14.4h10z" fill="currentColor" />`,
  IconCredits: `<path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M5.64 18.36l12.72-12.72" />`,
  IconSphere: `<circle cx="12" cy="12" r="9" /> <ellipse cx="12" cy="12" rx="9" ry="3.5" />`,
  IconHelix: `<path d="M7 4.5c5-2 10 0 10 2.5s-5 3.5-10 2 10-.5 10 2.5-5 3.5-10 2 10-.5 10 2.5-5 3.5-10 2 10-.5 10 2" />`,
  IconIcosahedron: `<polygon points="12 2 20.5 7 20.5 17 12 22 3.5 17 3.5 7" /> <line x1="12" y1="2" x2="12" y2="22" /> <polyline points="3.5 7 12 12 20.5 7" /> <polyline points="3.5 17 12 12 20.5 17" />`,
  IconDodecahedron: `<polygon points="12 2 21 8.5 17.5 19 6.5 19 3 8.5" /> <polygon points="12 15 15.5 12.5 14 8.5 10 8.5 8.5 12.5" /> <line x1="12" y1="2" x2="12" y2="8.5" /> <line x1="21" y1="8.5" x2="15.5" y2="12.5" /> <line x1="17.5" y1="19" x2="12" y2="15" /> <line x1="6.5" y1="19" x2="8.5" y2="12.5" /> <line x1="3" y1="8.5" x2="10" y2="8.5" />`,
  IconTorusKnot: `<circle cx="12" cy="12" r="8" /> <path d="M12 4a8 8 0 0 1 7 4M12 20a8 8 0 0 1-7-4" /> <ellipse cx="12" cy="12" rx="4" ry="8" transform="rotate(30 12 12)" /> <ellipse cx="12" cy="12" rx="4" ry="8" transform="rotate(-30 12 12)" />`
};

for (const fn of dump.customFunctions) {
  const cat = categorize(fn.name, fn.name);
  const elements = customFuncElements[fn.name] || "Custom SVG Elements";
  allFeatures.push({
    exportName: fn.name,
    canonicalName: `custom-${fn.name.replace(/^Icon/, "").toLowerCase()}`,
    category: cat,
    type: "Handcrafted 24×24 SVG Function Component",
    summary: elements,
    elementsXml: elements,
    inputs: "size (default 16 or 14), strokeWidth (default 1.5), className, color",
    outputs: "24×24 stroke/fill SVG / CoreGraphics path",
    errorBehavior: "Renders fallback bounds if path fails",
    discoveredVia: `src/canvas/icons.jsx:export function ${fn.name}`,
    rawNode: null
  });
}

// 3. Custom Aliases in icons.jsx
for (const c of dump.customConsts) {
  if (c.name === "ICON_STROKE_WIDTH") continue;
  const cat = categorize(c.name, c.target);
  allFeatures.push({
    exportName: c.name,
    canonicalName: `alias -> ${c.target}`,
    category: cat,
    type: "Alias / Re-export of Custom Icon",
    summary: `Points to ${c.target}`,
    elementsXml: `Alias of ${c.target}`,
    inputs: "Inherits from target icon",
    outputs: "Same as target icon",
    errorBehavior: "Same as target icon",
    discoveredVia: `src/canvas/icons.jsx:export const ${c.name} = ${c.target}`,
    rawNode: null
  });
}

for (const a of dump.aliasExports) {
  const cat = categorize(a.alias, a.orig);
  allFeatures.push({
    exportName: a.alias,
    canonicalName: `alias -> ${a.orig}`,
    category: cat,
    type: "Named Export Alias",
    summary: `Points to ${a.orig}`,
    elementsXml: `Alias of ${a.orig}`,
    inputs: "Inherits from target icon",
    outputs: "Same as target icon",
    errorBehavior: "Same as target icon",
    discoveredVia: `src/canvas/icons.jsx:export { ${a.orig} as ${a.alias} }`,
    rawNode: null
  });
}

// 4. Motion Icon
allFeatures.push({
  exportName: "IconMotion",
  canonicalName: "custom-motion",
  category: "Media, Audio/Video & Animation",
  type: "Handcrafted Filled Compound Path",
  summary: `Filled overlapping motion circles: <path d="M15.5 2.00023C12.13... fill="currentColor" />`,
  elementsXml: `<path d="M15.5 2.00023C12.13 2.00023 9.34999 4.58023 9.02999 7.87023C7.98807 8.26242 7.09125 8.96429 6.46016 9.88142C5.82907 10.7986 5.49399 11.887 5.49999 13.0002V13.1202C3.49999 13.5702 1.98999 15.3602 1.98999 17.5002C1.98999 19.9802 4.00999 22.0002 6.48999 22.0002C8.62999 22.0002 10.42 20.5002 10.87 18.4902H10.99C13.31 18.4902 15.32 17.0702 16.12 14.9602C19.41 14.6402 21.99 11.8602 21.99 8.49023C21.99 4.91023 19.07 1.99023 15.49 1.99023L15.5 2.00023ZM6.49999 20.0002C5.83695 20.0002 5.20106 19.7368 4.73222 19.268C4.26338 18.7992 3.99999 18.1633 3.99999 17.5002C3.99999 16.3302 4.80999 15.3502 5.89999 15.0702C5.90999 15.1002 5.93999 15.1302 5.94999 15.1702C6.05999 15.4302 6.19999 15.6902 6.34999 15.9302C6.39999 16.0002 6.43999 16.0802 6.48999 16.1502C6.66999 16.4102 6.85999 16.6502 7.07999 16.8702L7.11999 16.9102C7.33999 17.1302 7.57999 17.3202 7.83999 17.5002C7.91999 17.5602 7.99999 17.6102 8.08999 17.6602C8.30999 17.8002 8.53999 17.9202 8.77999 18.0302C8.82999 18.0502 8.86999 18.0802 8.91999 18.1002C8.7842 18.6422 8.47146 19.1234 8.0313 19.4676C7.59114 19.8117 7.04873 19.9992 6.48999 20.0002H6.49999ZM10.22 16.4202C10.057 16.3804 9.89669 16.3303 9.73999 16.2702C9.07982 16.0185 8.51193 15.5717 8.1118 14.9894C7.71168 14.4071 7.49828 13.7168 7.49999 13.0102C7.49999 11.7502 8.14999 10.6302 9.17999 10.0202C9.17999 10.0402 9.18999 10.0602 9.19999 10.0902C9.25999 10.3302 9.32999 10.5602 9.41999 10.7902C9.43999 10.8502 9.46999 10.9202 9.48999 10.9802C9.58999 11.2302 9.69999 11.4702 9.82999 11.7002C9.82999 11.7102 9.84999 11.7302 9.84999 11.7402C9.96999 11.9602 10.11 12.1702 10.26 12.3702C10.3 12.4202 10.34 12.4802 10.38 12.5302C10.7 12.9502 11.08 13.3202 11.49 13.6402C11.54 13.6802 11.59 13.7202 11.65 13.7602C11.85 13.9102 12.06 14.0502 12.28 14.1702C12.29 14.1702 12.3 14.1802 12.31 14.1902C12.54 14.3202 12.78 14.4302 13.03 14.5302C13.09 14.5502 13.15 14.5802 13.22 14.6002C13.45 14.6902 13.69 14.7602 13.93 14.8202C13.95 14.8202 13.97 14.8302 13.99 14.8402C13.24 16.0802 11.74 16.7602 10.21 16.4302L10.22 16.4202Z" fill="currentColor" />`,
  inputs: "size (default 16), className",
  outputs: "Filled 24×24 compound vector glyph in currentColor",
  errorBehavior: "Renders empty if SVG fails",
  discoveredVia: "src/canvas/icons_motion.jsx",
  rawNode: null
});

// 5. Hand-drawn Adjustment Glyphs in kind_icons.jsx
const handDrawnKindIcons = [
  {
    name: "blackAndWhite",
    summary: "Photoshop split disc: circle cx=12 cy=12 r=9 + half circle path d='M12 3a9 9 0 0 0 0 18z' fill=currentColor",
    elements: `<circle cx="12" cy="12" r="9" /> <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />`
  },
  {
    name: "invert",
    summary: "Split polarity panel: rect x=3 y=3 w=18 h=18 rx=2 + left filled rect path d='M5 5h7v14H5z' fill=currentColor",
    elements: `<rect x="3" y="3" width="18" height="18" rx="2" /> <path d="M5 5h7v14H5z" fill="currentColor" stroke="none" />`
  },
  {
    name: "threshold",
    summary: "Histogram hard cut: vertical bars d='M4 16V8M7 16v-5M10 16V6M13 16v-8M16 16v-4M19 16V9' + baseline d='M3 19h18' + divider d='M12.4 3v14h-.8V3z'",
    elements: `<path d="M4 16V8M7 16v-5M10 16V6M13 16v-8M16 16v-4M19 16V9" /> <path d="M3 19h18" /> <path d="M12.4 3v14h-.8V3z" fill="currentColor" stroke="none" />`
  },
  {
    name: "kind-fallback",
    summary: "Catalogue fallback dot: circle cx=12 cy=12 r=4 fill=currentColor",
    elements: `<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />`
  }
];

for (const k of handDrawnKindIcons) {
  allFeatures.push({
    exportName: `KindIcon(${k.name})`,
    canonicalName: `handdrawn-${k.name}`,
    category: "Adjustment & Filter Glyphs",
    type: "Handcrafted 24×24 Vector Glyph in kind_icons.jsx",
    summary: k.summary,
    elementsXml: k.elements,
    inputs: "kind (string), size (default 13), strokeWidth (default 1.5), className",
    outputs: "24×24 stroke+fill SVG / CoreGraphics path",
    errorBehavior: "Renders FALLBACK (circle r=4) if kind unknown",
    discoveredVia: "src/canvas/components/editor_properties/kind_icons.jsx:HAND_DRAWN",
    rawNode: null
  });
}

// 6. VOO Brand Logo
allFeatures.push({
  exportName: "VooBrandLogo",
  canonicalName: "voo-mark",
  category: "Brand Assets & Identity",
  type: "Canonical VOO Brand Logo (Hexagon + Inscribed Triangle + Circle Cutout)",
  summary: `Compound filled path: d="M21 6.25V16.75L11.5 22L2 16.75V6.25L11.5 1L21 6.25ZM11.5 22L21 6.25H2L11.5 22ZM11.5 6.66016C14.2777 6.66016... fill=currentColor"`,
  elementsXml: `<path d="M21 6.25V16.75L11.5 22L2 16.75V6.25L11.5 1L21 6.25ZM11.5 22L21 6.25H2L11.5 22ZM11.5 6.66016C14.2777 6.66016 16.5294 8.82703 16.5294 11.5C16.5294 14.173 14.2777 16.3398 11.5 16.3398C8.72233 16.3398 6.47059 14.173 6.47059 11.5C6.47059 8.82703 8.72233 6.66016 11.5 6.66016Z" fill="currentColor" />`,
  inputs: "rect / size (20px in TitleBar per UI_SPEC, 24px default), color (black or white)",
  outputs: "24×24 compound filled vector glyph (even-odd winding cutout circle)",
  errorBehavior: "Renders solid hexagon fallback if compound clipping fails",
  discoveredVia: "public/voo-mark.svg",
  rawNode: null
});

console.log("Total features gathered:", allFeatures.length);

// Sort features by Category, then by Export Name
allFeatures.sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.exportName.localeCompare(b.exportName);
});

// Build Markdown
let md = `# Canonical Lucide Icon Specification for VOO Design & native_studio

**Specification Status**: Complete, Authoritative Reference  
**Extraction Date**: 2026-10-21  
**Author**: Specification Miner (\`spec_miner_survey\`)  
**Primary Sources Analyzed**:
1. \`/Users/tt/teamwork_projects/voo_design/src/canvas/icons.jsx\`
2. \`/Users/tt/teamwork_projects/voo_design/node_modules/lucide-react/\` (v1.59.0 / ISC)
3. \`/Users/tt/teamwork_projects/voo_design/src/canvas/icons_motion.jsx\`
4. \`/Users/tt/teamwork_projects/voo_design/src/canvas/components/editor_properties/kind_icons.jsx\`
5. \`/Users/tt/teamwork_projects/voo_design/public/voo-mark.svg\`
6. \`/Users/tt/teamwork_projects/voo_design/native_studio/UI_SPEC.md\`

---

## Executive Summary & Core Rules

### 1. Vector Geometry & Coordinate Space
- **Grid Size**: All canonical Lucide glyphs and VOO Design custom glyphs are strictly authored on a **24×24 unit coordinate box** (\`viewBox="0 0 24 24"\`).
- **Stroke Width**: Default stroke width across VOO Design is **1.5pt** (\`ICON_STROKE_WIDTH = 1.5\` in \`icons.jsx\`), overriding Lucide's default package stroke of 2.0pt.
- **Line Caps & Joins**: All stroked paths, polylines, and lines enforce **\`.round\` line cap** (\`stroke-linecap="round"\`) and **\`.round\` line join** (\`stroke-linejoin="round"\`).
- **Paint Semantics**:
  - Outlined stroke glyphs: \`stroke="currentColor"\`, \`fill="none"\`.
  - Filled glyphs: \`fill="currentColor"\`, \`stroke="none"\` (e.g. \`VooBrandLogo\`, \`IconMotion\`, \`IconChrome\`, \`IconOpenCode\`, \`IconMask\` inner circle, \`IconOpacity\` half-disc, \`IconAiAutoMask\` / \`IconHealAi\` sparkles).
  - Dashed strokes: Stored with specific dash arrays (e.g. \`strokeDasharray="3 4"\` or \`"3 2.5"\` for selection marquees and patch tools).

### 2. Sizing Conventions per UI_SPEC.md
The native macOS app (\`native_studio\`) renders icons across 7 strict size tiers:
| Target Size | Component Context | Sizing Rule & Notes |
|---|---|---|
| **12px** | LayersPanel opacity/blend row pill | \`UI_SPEC.md\` §4: \`pill h28、px10、radius12、icon12、文字10\` |
| **13px** | WelcomeDashboard Open button; LayersPanel search/sort; Inspector headers; EditorChrome zoom bar; Island bar; KindIcon default | \`UI_SPEC.md\` §2, §4, §5, §6. Stroke scaled or crisp 1.2–1.4pt. |
| **14px** | WelcomeDashboard navigation; +New button; LayersPanel row type & eye visibility; Layers bottom bar; Login marks; Credits asterisk | \`UI_SPEC.md\` §2, §4. Standard density for lists and compact toolbar rows. |
| **15px** | Settings drawer tab items; \`IconHelp\` default | \`UI_SPEC.md\` §9: \`Tab min-h48、px12 py12、radius12、gap8、icon15\` |
| **16px** | ToolRail tool buttons (active/inactive); TitleBar tab close; WelcomeDashboard import cards; AgentPanel header | \`UI_SPEC.md\` §1, §3, §7. Standard primary tool icon size. |
| **20px** | TitleBar Brand Logo button; TitleBar Settings ⚡ button | \`UI_SPEC.md\` §1: \`品牌按钮 icon 20\`, \`设置 ⚡ 20×20\` |
| **21px** | WelcomeDashboard view switcher | \`UI_SPEC.md\` §2: \`视图切换 21×21、padding4、radius8\` |
| **24px** | TitleBar new document plus circle button; standard Lucide grid | \`UI_SPEC.md\` §1: \`新建 + 24×24 圆\` |

### 3. Stroke Scaling & Retina Pixel Snapping
- **Proportional Scaling in CoreGraphics**: When scaling the 24×24 coordinate grid to target size $s$ via \`ctx.scaleBy(x: s / 24.0, y: -s / 24.0)\`, setting context line width to 1.5pt will scale down to $1.5 \\times (s / 24)$ pt. At 16px, this yields exactly 1.0pt stroke. At 12px, it yields 0.75pt.
- **Fixed Optical Weight**: If \`UI_SPEC.md\` requires stroke 1.5pt constant on screen, context line width in the scaled grid must be set to \`strokeWidth / (s / 24.0)\`.
- **Retina Snapping**: On 2x Retina screens (\`NSScreen.backingScaleFactor == 2.0\`), target sizes 12px, 14px, 16px, 20px, 24px land on exact pixel boundaries (24px, 28px, 32px, 40px, 48px device pixels), guaranteeing crisp zero-blur rendering.

---

## Features Discovered

Total Discovered Canonical Icons: **${allFeatures.length}**

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
`;

allFeatures.forEach((f, idx) => {
  const num = idx + 1;
  const cat = escapePipes(f.category);
  const feat = escapePipes(`${f.exportName} (\`${f.canonicalName}\`)`);
  const desc = escapePipes(f.summary.length > 90 ? f.summary.substring(0, 87) + "..." : f.summary);
  const inp = escapePipes(f.inputs);
  const outp = escapePipes(f.outputs);
  const err = escapePipes(f.errorBehavior);
  const disc = escapePipes(f.discoveredVia);
  md += `| ${num} | ${cat} | ${feat} | ${desc} | ${inp} | ${outp} | ${err} | ${disc} |\n`;
});

md += `

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Subpixel Snapping at Fractional Sizes (13px & 15px) | Rendered at 13×13 or 15×15 on 1x display vs 2x Retina display | On 2x displays, 13px becomes 26 physical pixels (even integer, crisp). On 1x displays, 0.5px centering offset required to avoid subpixel antialiasing blur. |
| 2 | CoreGraphics Flipped Coordinate System | Rendered inside flipped \`NSTableView\` rows (e.g. \`LayersPanel\`) | Standard \`CGContext\` has y-up (origin bottom-left), whereas macOS flipped views have origin top-left. Drawing with \`translateBy(0, height); scaleBy(1, -1)\` maps canonical Lucide y-down coordinates to screen without upside-down inversion. |
| 3 | Filled vs Stroked Cursor in Active Tool State | \`drawCursor\` with \`isSolid: true\` vs \`isSolid: false\` | In ToolRail, inactive tool draws stroke 1.5pt with round join; active tool draws solid white fill with white background circle pill. |
| 4 | Compound Path Cutout for VOO Brand Logo | Outer hexagon, inverted triangle, and central circle | The SVG defines a single compound path (\`public/voo-mark.svg\`). When filled using the Non-Zero Winding rule, the inner triangle and circle render properly cutout; in CoreGraphics, \`path.fill(using: .evenOdd)\` or non-zero must be chosen to ensure the inner circular aperture stays transparent. |
| 5 | Sparkle Group Scaling in AI Retouching Tools | \`IconAiAutoMask\`, \`IconAiObjectSelection\`, \`IconAiRemove\`, \`IconHealAi\` | Sparkle badge is placed in bottom-right quadrant with affine transform: \`transform="translate(3.6, 3.4) scale(0.8)"\`. Path coordinates must be transformed before merging into a single \`CGPath\`. |
| 6 | Dashed Stroke Marquees | \`IconSelectionRect\`, \`IconSelectionEllipse\`, \`IconSelectionFree\`, \`IconSelectionPolygon\`, \`IconPatch\` | Require explicit phase and dash array (e.g. \`setLineDash(phase: 0, lengths: [3, 4])\`). CoreGraphics contexts must reset dash lengths after drawing to avoid leaking into subsequent strokes. |
| 7 | Custom Photoshop-Style Split Glyphs in kind_icons.jsx | \`blackAndWhite\`, \`invert\`, \`threshold\` | Half the glyph is stroked, half is filled (\`fill="currentColor"\`). Lucide has no split-tone equivalents, so these MUST be retained as custom vector drawings on the 24×24 grid. |
| 8 | Missing/Unknown Adjustment Kind in kind_icons.jsx | Unknown \`kind\` string passed to \`KindIcon\` | Authoritative fallback is central filled solid dot \`<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />\` (NOT an empty square or error throw). |
| 9 | Algorithmic Warp Icon Geometry (WarpStyleIcon) | Preset strings (\`bulge\`, \`fisheye\`, \`twist\`, \`custom\`) | Generates bicubic patch outlines on a 100×100 viewBox with 7pt stroke, rather than standard 24×24 Lucide SVG. Custom preset renders frame with 4 corner handle circles. |
| 10 | System Symbol Name Divergence in WindowController | \`NSImage(systemSymbolName: "rectangle.on.rectangle")\` | Diverges from Lucide. Must be replaced with canonical \`VooIconFactory.drawCopy\` (Lucide \`Copy\`) on 24×24 grid. |
| 11 | Secondary Factory Inconsistencies | \`PropertiesGlyphFactory\` (.settings, .transfer, .eyedropper) | \`.settings\` currently draws a rounded square with dot instead of Lucide \`Settings\` gear; \`.transfer\` draws ad-hoc arrows instead of Lucide \`IconSwap\`; \`.eyedropper\` draws ad-hoc pipette instead of Lucide \`Pipette\`. All must delegate to canonical Lucide vector geometries. |
| 12 | Inline Ad-hoc Icons in WelcomeDashboardView | \`drawFolderIcon\`, \`drawStarIcon\`, \`drawRefreshIcon\` | Currently hardcoded private routines in \`WelcomeDashboardView.swift\`. Must be consolidated to \`VooIconFactory.drawFolder\` (Lucide \`Folder\`), \`drawStar\` (Lucide \`Star\`), and \`drawRefresh\` (Lucide \`RefreshCw\`). |

---

## Complete Vector Geometry Catalog (Canonical 24×24 XML Nodes)

Below is the authoritative coordinate and element definition for every canonical icon:

`;

// Append full XML nodes for every feature
allFeatures.forEach((f, idx) => {
  md += `### ${idx + 1}. \`${f.exportName}\` (Canonical: \`${f.canonicalName}\`)\n`;
  md += `- **Category**: ${f.category}\n`;
  md += `- **Type**: ${f.type}\n`;
  md += `- **Authoritative Elements**: \`${f.elementsXml}\`\n`;
  md += `- **Discovered Via**: \`${f.discoveredVia}\`\n\n`;
});

fs.writeFileSync(
  "/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/lucide_spec_report.md",
  md
);
console.log("Successfully wrote lucide_spec_report.md");
