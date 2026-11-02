/**
 * Pure CSS Grid layout calculator for HTML-to-layer conversion.
 * Deterministic tracks, repeat(), fr/px/%/auto, gap, placement, and alignment.
 */

import { toPx, parsePadding, parseMargin, parseGap } from "./html_layout_utils.js";

export function expandGridTemplate(raw) {
  if (!raw || typeof raw !== "string") return [];
  let str = raw.trim();
  const repeatRegex = /repeat\(\s*(\d+)\s*,\s*([^)]+)\)/gi;
  while (repeatRegex.test(str)) {
    str = str.replace(repeatRegex, (_, count, pattern) => {
      const times = Math.max(1, Math.min(100, Number.parseInt(count, 10) || 1));
      return Array(times).fill(pattern.trim()).join(" ");
    });
  }
  const tokens = [];
  let current = "";
  let parenDepth = 0;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (/\s/.test(ch) && parenDepth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens.map(parseTrackToken);
}

function parseTrackToken(token) {
  const t = token.trim().toLowerCase();
  if (t === "auto") return { type: "auto" };
  if (t.endsWith("fr")) {
    const val = Number.parseFloat(t.slice(0, -2));
    return { type: "fr", value: Number.isFinite(val) ? val : 1 };
  }
  if (t.endsWith("%")) {
    const val = Number.parseFloat(t.slice(0, -1));
    return { type: "percent", value: Number.isFinite(val) ? val : 0 };
  }
  if (t.startsWith("minmax(")) {
    const inner = t.slice(7, -1).trim().split(/\s*,\s*/);
    return parseTrackToken(inner[1] || inner[0]);
  }
  const pxVal = toPx(t);
  return pxVal != null ? { type: "px", value: pxVal } : { type: "auto" };
}

function parseGridPlacement(value) {
  if (!value) return { start: null, span: 1 };
  const str = String(value).trim().toLowerCase();
  if (str.startsWith("span")) {
    const span = Number.parseInt(str.split(/\s+/)[1], 10) || 1;
    return { start: null, span: Math.max(1, span) };
  }
  if (str.includes("/")) {
    const [p0, p1] = str.split("/").map((s) => s.trim());
    const startNum = Number.parseInt(p0, 10);
    const span = p1.startsWith("span")
      ? Number.parseInt(p1.split(/\s+/)[1], 10) || 1
      : Math.max(1, (Number.parseInt(p1, 10) || 1) - (startNum || 1));
    return { start: Number.isFinite(startNum) ? startNum : null, span };
  }
  const num = Number.parseInt(str, 10);
  return { start: Number.isFinite(num) ? num : null, span: 1 };
}

export function computeGridLayout(
  container,
  containerStyle,
  children,
  containerBox,
  ctx,
  { contentWidth, contentHeight, parseInlineStyle, isSkipTag },
) {
  const childBoxes = new Map();
  if (!children || children.length === 0) return { childBoxes, contentWidth: 0, contentHeight: 0 };

  const pad = parsePadding(containerStyle);
  const gaps = parseGap(containerStyle);
  const colGap = gaps.col;
  const rowGap = gaps.row;
  const innerW = Math.max(0, containerBox.width - pad.left - pad.right);
  const innerH = containerBox.height > 0 ? Math.max(0, containerBox.height - pad.top - pad.bottom) : 0;

  const inFlowItems = [];
  for (const child of children) {
    if (isSkipTag(String(child.tag ?? "div").toLowerCase())) continue;
    const cStyle = parseInlineStyle(child.style);
    if (cStyle.display === "none" || cStyle.visibility === "hidden") continue;
    if (cStyle.position === "absolute" || cStyle.position === "fixed") continue;
    const colPlacement = parseGridPlacement(cStyle.gridColumn ?? cStyle.gridColumnStart);
    const rowPlacement = parseGridPlacement(cStyle.gridRow ?? cStyle.gridRowStart);
    inFlowItems.push({
      child,
      style: cStyle,
      margin: parseMargin(cStyle),
      colStart: colPlacement.start,
      colSpan: colPlacement.span,
      rowStart: rowPlacement.start,
      rowSpan: rowPlacement.span,
    });
  }
  if (inFlowItems.length === 0) return { childBoxes, contentWidth: 0, contentHeight: 0 };

  let colTracks = expandGridTemplate(containerStyle.gridTemplateColumns);
  if (colTracks.length === 0) {
    const maxCol = Math.max(...inFlowItems.map((it) => (it.colStart ? it.colStart + it.colSpan - 1 : 1)), 1);
    colTracks = Array(maxCol).fill({ type: "fr", value: 1 });
  }
  const numCols = Math.max(1, colTracks.length);

  // Auto-placement
  const isColFlow = String(containerStyle.gridAutoFlow || "row").toLowerCase().includes("column");
  const occupied = new Set();
  const key = (r, c) => `${r},${c}`;

  function isFree(r, c, rSpan, cSpan) {
    for (let dr = 0; dr < rSpan; dr += 1) {
      for (let dc = 0; dc < cSpan; dc += 1) {
        if (occupied.has(key(r + dr, c + dc))) return false;
      }
    }
    return true;
  }
  function mark(r, c, rSpan, cSpan) {
    for (let dr = 0; dr < rSpan; dr += 1) {
      for (let dc = 0; dc < cSpan; dc += 1) occupied.add(key(r + dr, c + dc));
    }
  }

  for (const it of inFlowItems) {
    if (it.colStart != null && it.rowStart != null) {
      it.placedRow = Math.max(1, it.rowStart);
      it.placedCol = Math.max(1, it.colStart);
      mark(it.placedRow, it.placedCol, it.rowSpan, it.colSpan);
    }
  }

  let curR = 1;
  let curC = 1;
  for (const it of inFlowItems) {
    if (it.placedRow != null && it.placedCol != null) continue;
    if (it.colStart != null) {
      let r = 1;
      while (!isFree(r, it.colStart, it.rowSpan, it.colSpan)) r += 1;
      it.placedRow = r;
      it.placedCol = it.colStart;
      mark(r, it.colStart, it.rowSpan, it.colSpan);
    } else if (it.rowStart != null) {
      let c = 1;
      while (!isFree(it.rowStart, c, it.rowSpan, it.colSpan)) c += 1;
      it.placedRow = it.rowStart;
      it.placedCol = c;
      mark(it.rowStart, c, it.rowSpan, it.colSpan);
    } else {
      let found = false;
      while (!found) {
        if (isFree(curR, curC, it.rowSpan, it.colSpan)) {
          it.placedRow = curR;
          it.placedCol = curC;
          mark(curR, curC, it.rowSpan, it.colSpan);
          found = true;
        }
        if (!isColFlow) {
          curC += 1;
          if (curC + it.colSpan - 1 > numCols) { curC = 1; curR += 1; }
        } else {
          curR += 1;
          if (curR > 1000) { curR = 1; curC += 1; }
        }
      }
    }
  }

  const numRows = Math.max(...inFlowItems.map((it) => it.placedRow + it.rowSpan - 1), 1);
  const totalColGap = Math.max(0, numCols - 1) * colGap;
  const availColSpace = Math.max(0, innerW - totalColGap);

  let fixedColWidth = 0;
  let totalColFr = 0;
  for (const tr of colTracks) {
    if (tr.type === "px") fixedColWidth += tr.value;
    else if (tr.type === "percent") fixedColWidth += availColSpace * (tr.value / 100);
    else if (tr.type === "fr") totalColFr += tr.value;
  }
  const remColSpace = Math.max(0, availColSpace - fixedColWidth);
  const colWidths = colTracks.map((tr) => {
    if (tr.type === "px") return tr.value;
    if (tr.type === "percent") return availColSpace * (tr.value / 100);
    if (tr.type === "fr") return totalColFr > 0 ? (tr.value / totalColFr) * remColSpace : 0;
    return totalColFr === 0 ? remColSpace / numCols : 100;
  });

  const rowTracks = expandGridTemplate(containerStyle.gridTemplateRows);
  const rowHeights = [];
  for (let r = 1; r <= numRows; r += 1) {
    const tr = rowTracks[r - 1];
    if (tr && tr.type === "px") rowHeights.push(tr.value);
    else if (tr && tr.type === "percent" && innerH > 0) rowHeights.push(innerH * (tr.value / 100));
    else if (tr && tr.type === "fr" && innerH > 0) rowHeights.push(innerH / numRows);
    else {
      const itemsInRow = inFlowItems.filter((it) => it.placedRow === r);
      let maxH = 0;
      for (const it of itemsInRow) {
        const expH = toPx(it.style.height);
        maxH = Math.max(maxH, expH ?? contentHeight(it.child, it.style, colWidths[it.placedCol - 1] || 100));
      }
      rowHeights.push(Math.max(20, maxH));
    }
  }

  const totalColsW = colWidths.reduce((a, b) => a + b, 0) + totalColGap;
  const totalRowsH = rowHeights.reduce((a, b) => a + b, 0) + Math.max(0, numRows - 1) * rowGap;
  const freeGridX = innerW > totalColsW ? innerW - totalColsW : 0;
  const freeGridY = innerH > totalRowsH ? innerH - totalRowsH : 0;

  let gridOffsetX = 0;
  const jGrid = String(containerStyle.justifyContent ?? "start").toLowerCase();
  if (freeGridX > 0 && (jGrid === "center" || jGrid === "end" || jGrid === "flex-end")) {
    gridOffsetX = jGrid === "center" ? freeGridX / 2 : freeGridX;
  }
  let gridOffsetY = 0;
  const aGrid = String(containerStyle.alignContent ?? "start").toLowerCase();
  if (freeGridY > 0 && (aGrid === "center" || aGrid === "end" || aGrid === "flex-end")) {
    gridOffsetY = aGrid === "center" ? freeGridY / 2 : freeGridY;
  }

  const colX = [0];
  for (let c = 0; c < numCols; c += 1) colX[c + 1] = colX[c] + colWidths[c] + colGap;
  const rowY = [0];
  for (let r = 0; r < numRows; r += 1) rowY[r + 1] = rowY[r] + rowHeights[r] + rowGap;

  const defJ = String(containerStyle.justifyItems ?? "stretch").toLowerCase();
  const defA = String(containerStyle.alignItems ?? "stretch").toLowerCase();
  let maxDocX = containerBox.x;
  let maxDocY = containerBox.y;

  for (const it of inFlowItems) {
    const cIdx = it.placedCol - 1;
    const rIdx = it.placedRow - 1;
    let cellW = 0;
    for (let c = 0; c < it.colSpan; c += 1) cellW += colWidths[cIdx + c] || 0;
    cellW += Math.max(0, it.colSpan - 1) * colGap;

    let cellH = 0;
    for (let r = 0; r < it.rowSpan; r += 1) cellH += rowHeights[rIdx + r] || 0;
    cellH += Math.max(0, it.rowSpan - 1) * rowGap;

    const cellL = containerBox.x + pad.left + gridOffsetX + (colX[cIdx] || 0);
    const cellT = containerBox.y + pad.top + gridOffsetY + (rowY[rIdx] || 0);
    const m = it.margin;
    const netW = Math.max(0, cellW - m.left - m.right);
    const netH = Math.max(0, cellH - m.top - m.bottom);

    const jSelf = String(it.style.justifySelf ?? defJ).toLowerCase();
    const aSelf = String(it.style.alignSelf ?? defA).toLowerCase();

    let w = toPx(it.style.width);
    if (w == null) w = jSelf === "stretch" ? netW : contentWidth(it.child, it.style, netW);
    let h = toPx(it.style.height);
    if (h == null) h = aSelf === "stretch" ? netH : contentHeight(it.child, it.style, w);

    let x = cellL + m.left;
    if (jSelf === "center") x += Math.max(0, (netW - w) / 2);
    else if (jSelf === "end" || jSelf === "flex-end") x += Math.max(0, netW - w);

    let y = cellT + m.top;
    if (aSelf === "center") y += Math.max(0, (netH - h) / 2);
    else if (aSelf === "end" || aSelf === "flex-end") y += Math.max(0, netH - h);

    childBoxes.set(it.child, {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
      absolute: false,
    });
    maxDocX = Math.max(maxDocX, x + w + m.right);
    maxDocY = Math.max(maxDocY, y + h + m.bottom);
  }

  return {
    childBoxes,
    contentWidth: Math.max(0, maxDocX - containerBox.x + pad.right),
    contentHeight: Math.max(0, maxDocY - containerBox.y + pad.bottom),
  };
}
