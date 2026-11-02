import { CLOSE_THRESHOLD } from "./editor_pen.js";
import { fromNodeLocal } from "./scene_geometry.js";

/**
 * The pen tool's live chrome: anchors, handle arms, and the rubber band from
 * the last anchor to the cursor while a path is being drawn; the same chrome
 * for the node being edited. Drawn in doc space, so it pans and zooms with
 * the page.
 */
export function drawPenOverlay(ctx, draft, edit, editNode, insertPreview) {
  ctx.save();
  const scale = ctx.getTransform().a || 1;
  ctx.lineWidth = 1 / scale;

  // Radii are screen pixels: dividing by the zoom keeps anchors and handle
  // dots the same size on screen at any magnification.
  const dot = (x, y, fill, r = 4.5) => {
    ctx.beginPath();
    ctx.arc(x, y, r / scale, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "#1c1c1c";
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke();
  };

  if (draft) {
    const {
      anchors,
      activeIndex,
      current,
      color = "#c084fc",
      strokeWidth = 2,
    } = draft;

    // 1. Draw the already placed path segments
    if (anchors.length > 1) {
      ctx.beginPath();
      ctx.moveTo(anchors[0].x, anchors[0].y);
      for (let index = 1; index < anchors.length; index += 1) {
        const from = anchors[index - 1];
        const to = anchors[index];
        if (from.out || to.in) {
          const c1 = from.out
            ? { x: from.x + from.out[0], y: from.y + from.out[1] }
            : from;
          const c2 = to.in ? { x: to.x + to.in[0], y: to.y + to.in[1] } : to;
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
        } else {
          ctx.lineTo(to.x, to.y);
        }
      }
      ctx.strokeStyle = color || "#c084fc";
      ctx.lineWidth = Math.max(1, strokeWidth);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    // 2. Rubber band from the last anchor to the cursor
    const last = anchors[anchors.length - 1];
    if (last && current) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      if (last.out) {
        const c1 = { x: last.x + last.out[0], y: last.y + last.out[1] };
        ctx.quadraticCurveTo(c1.x, c1.y, current.x, current.y);
      } else {
        ctx.lineTo(current.x, current.y);
      }
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Draw anchor points and handle arms
    anchors.forEach((anchor, index) => {
      // Handle arms on each anchor
      for (const key of ["in", "out"]) {
        if (!anchor[key]) continue;
        const hx = anchor.x + anchor[key][0];
        const hy = anchor.y + anchor[key][1];
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo(hx, hy);
        ctx.strokeStyle = "rgba(192,132,252,0.85)";
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
        dot(hx, hy, "#ffffff", 4);
      }
      // The first anchor lights up when the cursor is close enough that a
      // click would close the path — Figma's close affordance. The radius is
      // screen-constant, matching the pen tool's close snap.
      const closeHover =
        index === 0 &&
        anchors.length > 1 &&
        (draft.isClosing ||
          (current &&
            Math.hypot(current.x - anchor.x, current.y - anchor.y) <=
              CLOSE_THRESHOLD / scale));
      dot(
        anchor.x,
        anchor.y,
        closeHover ? "#a7ffd4" : index === activeIndex ? "#c084fc" : "#ffffff",
        closeHover ? 6.5 : index === activeIndex ? 6 : 4.5,
      );
      if (closeHover) {
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 10 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = "#a7ffd4";
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
      }
    });
  }

  if (edit && editNode && editNode.pen === true) {
    const scaleX = editNode.baseWidth ? editNode.width / editNode.baseWidth : 1;
    const scaleY = editNode.baseHeight
      ? editNode.height / editNode.baseHeight
      : 1;
    const world = (anchor, offset) => {
      const local = {
        x: (anchor.x + (offset ? offset[0] : 0)) * scaleX,
        y: (anchor.y + (offset ? offset[1] : 0)) * scaleY,
      };
      return fromNodeLocal(editNode, local);
    };
    // The path itself, stroked in the edit green so the curve reads while
    // anchors and handles are being reshaped.
    if (editNode.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(world(editNode.points[0]).x, world(editNode.points[0]).y);
      for (let index = 1; index < editNode.points.length; index += 1) {
        const from = editNode.points[index - 1];
        const to = editNode.points[index];
        if (from.out || to.in) {
          const c1 = from.out ? world(from, from.out) : world(from);
          const c2 = to.in ? world(to, to.in) : world(to);
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, world(to).x, world(to).y);
        } else {
          ctx.lineTo(world(to).x, world(to).y);
        }
      }
      // A closed path draws its closing segment back to the first anchor.
      const last = editNode.points[editNode.points.length - 1];
      if (last?.close === true && editNode.points.length > 1) {
        const first = editNode.points[0];
        if (last.out || first.in) {
          const c1 = last.out ? world(last, last.out) : world(last);
          const c2 = first.in ? world(first, first.in) : world(first);
          ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, world(first).x, world(first).y);
        } else {
          ctx.lineTo(world(first).x, world(first).y);
        }
      }
      ctx.strokeStyle = "#b2ffd6";
      ctx.lineWidth = Math.max(1, editNode.strokeWidth ?? 2);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    editNode.points.forEach((anchor, index) => {
      const a = world(anchor);
      const active =
        index === edit.active || edit.selected?.includes(index) === true;
      for (const key of ["in", "out"]) {
        if (!anchor[key]) continue;
        const h = world(anchor, anchor[key]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(h.x, h.y);
        ctx.strokeStyle = "rgba(178,255,214,0.9)";
        ctx.lineWidth = 1;
        ctx.stroke();
        dot(h.x, h.y, "#b2ffd6", 4);
      }
      dot(a.x, a.y, active ? "#b2ffd6" : "#ffffff", active ? 5.5 : 4.5);
    });

    // The lasso marquee while it is being dragged.
    if (edit.lasso) {
      const { start, current } = edit.lasso;
      ctx.beginPath();
      ctx.rect(
        Math.min(start.x, current.x),
        Math.min(start.y, current.y),
        Math.abs(current.x - start.x),
        Math.abs(current.y - start.y),
      );
      ctx.strokeStyle = "#b2ffd6";
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Hovering a segment previews where a click would insert an anchor.
    if (insertPreview) {
      ctx.beginPath();
      ctx.arc(
        insertPreview.x,
        insertPreview.y,
        4.5 / scale + 1.5,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = "#b2ffd6";
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();
      dot(insertPreview.x, insertPreview.y, "#b2ffd6", 4);
    }
  }

  ctx.restore();
}
