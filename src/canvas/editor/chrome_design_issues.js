import { nodeAABB } from "./scene_geometry.js";
import { docToScreenPoint } from "./chrome_coords.js";

const ISSUE_COLOR = "#ff6b72";

/** Paints review markers above artwork; markers remain editor chrome only. */
export function drawDesignIssueMarkers(ctx, doc, issues, viewport) {
  if (!Array.isArray(issues) || issues.length === 0) return;
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  const counts = new Map();
  for (const issue of issues) {
    for (const id of issue.nodeIds ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  ctx.save();
  ctx.font = "600 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [id, count] of counts) {
    const node = byId.get(id);
    if (!node || node.visible === false) continue;
    const box = nodeAABB(node);
    const point = docToScreenPoint({ x: box.x + box.width, y: box.y }, viewport);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = ISSUE_COLOR;
    ctx.fill();
    ctx.fillStyle = "#171717";
    ctx.fillText(String(Math.min(count, 9)), point.x, point.y + 0.5);
  }
  ctx.restore();
}
