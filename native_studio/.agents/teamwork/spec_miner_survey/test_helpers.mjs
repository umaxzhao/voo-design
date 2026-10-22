import fs from "fs";
import path from "path";

const projectRoot = "/Users/tt/teamwork_projects/voo_design";
const iconsDumpPath = "/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/icons_dump.json";
const dump = JSON.parse(fs.readFileSync(iconsDumpPath, "utf8"));

// Categories mapping helper
function categorize(name, lucideName, isKindGlyph) {
  if (isKindGlyph || name.startsWith("IconGlyph")) return "Adjustment & Filter Glyphs";
  if (name.includes("Ai") || name.includes("Sparkle") || name.includes("Wand") || name.includes("ReversePrompt") || name.includes("Magic")) return "AI & Smart Generation Tools";
  if (name.includes("Selection") || name.includes("Marquee") || name.includes("Lasso") || name.includes("Cursor") || name.includes("Crop")) return "Selection & Marquee Tools";
  if (name.includes("Heal") || name.includes("Bandage") || name.includes("Stamp") || name.includes("Patch")) return "Healing & Retouching Family";
  if (name.includes("Brush") || name.includes("Paint") || name.includes("Bucket") || name.includes("Pipette") || name.includes("Eraser") || name.includes("Pen") || name.includes("Bend") || name.includes("Cut") || name.includes("Scissors")) return "Drawing, Painting & Vector Path Editing";
  if (name.includes("Square") || name.includes("Circle") || name.includes("Triangle") || name.includes("Star") || name.includes("Diamond") || name.includes("Polygon") || name.includes("Pentagon") || name.includes("Box") || name.includes("Cylinder") || name.includes("Pyramid") || name.includes("Torus") || name.includes("Sphere") || name.includes("Helix") || name.includes("Icosahedron") || name.includes("Dodecahedron") || name.includes("Perspective") || name.includes("Warp") || name.includes("Distort") || name.includes("Flip") || name.includes("Rotate")) return "Shapes, Geometry & Transforms";
  if (name.includes("Text") || name.includes("Bold") || name.includes("Italic") || name.includes("Underline") || name.includes("List") || name.includes("AlignLeft") || name.includes("AlignCenter") || name.includes("AlignRight")) return "Typography & Text Styling";
  if (name.includes("Layer") || name.includes("Mask") || name.includes("Opacity") || name.includes("Transparency") || name.includes("Eye") || name.includes("Lock") || name.includes("Link")) return "Layers, Masking & Composition";
  if (name.includes("Image") || name.includes("Music") || name.includes("Video") || name.includes("Film") || name.includes("Clapper") || name.includes("Volume") || name.includes("Play") || name.includes("Pause") || name.includes("Skip") || name.includes("Repeat") || name.includes("Time") || name.includes("Motion") || name.includes("PictureInPicture") || name.includes("Subtitles")) return "Media, Audio/Video & Animation";
  if (name.includes("File") || name.includes("Folder") || name.includes("Save") || name.includes("Copy") || name.includes("Trash") || name.includes("Undo") || name.includes("Redo") || name.includes("Download") || name.includes("Upload") || name.includes("Share") || name.includes("Branch") || name.includes("Users")) return "Document & File Management";
  if (name.includes("Panel") || name.includes("Grid") || name.includes("Group") || name.includes("Layout") || name.includes("Frame") || name.includes("Component") || name.includes("Map") || name.includes("Move") || name.includes("Swap")) return "Canvas, Layout & Navigation Panels";
  if (name.includes("Google") || name.includes("Github") || name.includes("Chrome") || name.includes("OpenCode") || name.includes("Credits") || name.includes("Api") || name.includes("Code") || name.includes("Terminal") || name.includes("Server") || name.includes("Hd") || name.includes("Zap")) return "Third-Party, Services & Identity";
  return "App Shell & UI Affordances";
}

function formatNodeSimple(node) {
  if (!node || !node.length) return "";
  return node.map(([tag, attrs]) => {
    if (tag === "path") return `path(d: "${attrs.d}")`;
    if (tag === "circle") return `circle(cx: ${attrs.cx}, cy: ${attrs.cy}, r: ${attrs.r})`;
    if (tag === "rect") return `rect(x: ${attrs.x}, y: ${attrs.y}, w: ${attrs.width}, h: ${attrs.height}${attrs.rx ? `, rx: ${attrs.rx}` : ""})`;
    if (tag === "line") return `line((${attrs.x1},${attrs.y1})->(${attrs.x2},${attrs.y2}))`;
    if (tag === "polyline") return `polyline(${attrs.points})`;
    if (tag === "polygon") return `polygon(${attrs.points})`;
    if (tag === "ellipse") return `ellipse(cx: ${attrs.cx}, cy: ${attrs.cy}, rx: ${attrs.rx}, ry: ${attrs.ry})`;
    return `${tag}(${JSON.stringify(attrs)})`;
  }).join("; ");
}

console.log("Ready to build generator.");
