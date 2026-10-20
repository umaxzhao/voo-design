// Bounding-box alignment of a multi-selection. Pure function so it can be
// unit-tested without mounting the InspectorPanel. Returns the new (x, y)
// coordinates for every input item; callers commit them via updateNode /
// updateFrame.
import { computeBoundingBox } from "./bounding-box.js";
export const alignSelection = (items, type) => {
    // 0 or 1 items have nothing to align relative to — return identity moves.
    if (items.length < 2) {
        return items.map((i) => ({ id: i.id, x: i.x, y: i.y }));
    }
    // Shared with node-store group/fit-frame and any future bbox consumer —
    // keeps the four edge corners computed in exactly one place. Non-null
    // here because we short-circuited for items.length < 2 above.
    const bbox = computeBoundingBox(items);
    const minX = bbox.x;
    const maxX = bbox.x + bbox.w;
    const minY = bbox.y;
    const maxY = bbox.y + bbox.h;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return items.map((it) => {
        let nx = it.x;
        let ny = it.y;
        switch (type) {
            case "left":
                nx = minX;
                break;
            case "center":
                nx = cx - it.w / 2;
                break;
            case "right":
                nx = maxX - it.w;
                break;
            case "top":
                ny = minY;
                break;
            case "middle":
                ny = cy - it.h / 2;
                break;
            case "bottom":
                ny = maxY - it.h;
                break;
        }
        return { id: it.id, x: Math.round(nx), y: Math.round(ny) };
    });
};
export const distributeSelection = (items, axis) => {
    // Needs at least 3 items to have a "between" to distribute across.
    if (items.length < 3) {
        return items.map((i) => ({ id: i.id, x: i.x, y: i.y }));
    }
    const centerKey = axis === "horizontal" ? "x" : "y";
    const sizeKey = axis === "horizontal" ? "w" : "h";
    // Sort by centre on the active axis so anchors land on the outermost
    // items and the rest get re-spaced between them.
    const sorted = [...items].sort((a, b) => a[centerKey] + a[sizeKey] / 2 - (b[centerKey] + b[sizeKey] / 2));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const firstCenter = first[centerKey] + first[sizeKey] / 2;
    const lastCenter = last[centerKey] + last[sizeKey] / 2;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    const moved = new Map();
    sorted.forEach((it, i) => {
        if (i === 0 || i === sorted.length - 1) {
            moved.set(it.id, { id: it.id, x: Math.round(it.x), y: Math.round(it.y) });
            return;
        }
        const targetCenter = firstCenter + step * i;
        const next = Math.round(targetCenter - it[sizeKey] / 2);
        moved.set(it.id, {
            id: it.id,
            x: axis === "horizontal" ? next : Math.round(it.x),
            y: axis === "vertical" ? next : Math.round(it.y),
        });
    });
    // Preserve original input order in the returned array — callers iterate
    // over `items` so output index must match.
    return items.map((it) => moved.get(it.id));
};
/**
 * Equal-gap Tidy Up distribution along one axis — spreads elements such that
 * the visual white space (gap) between adjacent bounding box edges is equal.
 * `gap = (totalSpan - sum(sizes)) / (N - 1)`
 */
export const tidyUpSelection = (items, axis = "horizontal") => {
    if (items.length < 3) {
        return items.map((i) => ({ id: i.id, x: i.x, y: i.y }));
    }
    const posKey = axis === "horizontal" ? "x" : "y";
    const sizeKey = axis === "horizontal" ? "w" : "h";
    const sorted = [...items].sort((a, b) => a[posKey] - b[posKey]);
    const firstPos = sorted[0][posKey];
    const lastItem = sorted[sorted.length - 1];
    const lastEdge = lastItem[posKey] + lastItem[sizeKey];
    const totalSpan = lastEdge - firstPos;
    const sumSizes = sorted.reduce((acc, item) => acc + item[sizeKey], 0);
    const gap = (totalSpan - sumSizes) / (sorted.length - 1);
    let currentPos = firstPos;
    const moved = new Map();
    sorted.forEach((it, i) => {
        if (i === 0) {
            moved.set(it.id, { id: it.id, x: Math.round(it.x), y: Math.round(it.y) });
            currentPos += it[sizeKey] + gap;
            return;
        }
        const nextPos = Math.round(currentPos);
        moved.set(it.id, {
            id: it.id,
            x: axis === "horizontal" ? nextPos : Math.round(it.x),
            y: axis === "vertical" ? nextPos : Math.round(it.y),
        });
        currentPos += it[sizeKey] + gap;
    });
    return items.map((it) => moved.get(it.id));
};
//# sourceMappingURL=align.js.map