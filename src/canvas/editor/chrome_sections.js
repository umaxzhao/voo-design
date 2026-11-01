import { docToScreenRect } from "./chrome_coords.js";

const SECTION_COLOR = "rgba(178, 255, 214, 0.58)";
const SECTION_LABEL_BG = "rgba(22, 22, 22, 0.88)";

/** Draws organizational Sections in stage chrome only; they never enter exports. */
export function drawSections(ctx, nodes, viewport) {
  const sections = nodes.filter(node => node.section === true && node.visible !== false);
  if (sections.length === 0) return;

  ctx.save();
  ctx.font = "500 11px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  for (const section of sections) {
    const rect = docToScreenRect(section, viewport);
    ctx.strokeStyle = SECTION_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
    ctx.setLineDash([]);

    const title = section.name?.trim();
    if (!title) continue;
    const width = ctx.measureText(title).width + 12;
    const labelY = Math.max(2, rect.y - 20);
    ctx.fillStyle = SECTION_LABEL_BG;
    ctx.fillRect(rect.x, labelY, width, 18);
    ctx.fillStyle = SECTION_COLOR;
    ctx.fillText(title, rect.x + 6, labelY + 9);
  }
  ctx.restore();
}
