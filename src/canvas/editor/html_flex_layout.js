/**
 * Pure Flexbox layout calculator for HTML-to-layer conversion.
 *
 * Implements deterministic flex row/column, reverse, wrap, gap,
 * justify-content, align-items, align-self, align-content, and flex-grow/shrink/basis.
 * Produces document-space bounding boxes without DOM or layout library dependencies.
 */

import { toPx, parsePadding, parseMargin, parseGap } from "./html_layout_utils.js";

function parseFlexShorthand(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  if (str === "initial") return { grow: 0, shrink: 1, basis: "auto" };
  if (str === "auto") return { grow: 1, shrink: 1, basis: "auto" };
  if (str === "none") return { grow: 0, shrink: 0, basis: "auto" };
  const parts = str.split(/\s+/);
  if (parts.length === 1) {
    const n = Number.parseFloat(parts[0]);
    if (Number.isFinite(n) && !parts[0].endsWith("px") && !parts[0].endsWith("%")) {
      return { grow: n, shrink: 1, basis: 0 };
    }
    return { grow: 1, shrink: 1, basis: parts[0] };
  }
  if (parts.length === 2) {
    return { grow: Number.parseFloat(parts[0]) || 0, shrink: 1, basis: parts[1] };
  }
  return {
    grow: Number.parseFloat(parts[0]) || 0,
    shrink: Number.parseFloat(parts[1]) || 0,
    basis: parts[2],
  };
}

/**
 * Computes flex layout for container children.
 */
export function computeFlexLayout(
  container,
  containerStyle,
  children,
  containerBox,
  ctx,
  { contentWidth, contentHeight, parseInlineStyle, isSkipTag },
) {
  const childBoxes = new Map();
  if (!children || children.length === 0) {
    return { childBoxes, contentWidth: 0, contentHeight: 0 };
  }

  const dir = String(containerStyle.flexDirection || "row").toLowerCase();
  const isRow = dir === "row" || dir === "row-reverse";
  const isReverse = dir === "row-reverse" || dir === "column-reverse";
  const wrap = String(containerStyle.flexWrap || "nowrap").toLowerCase();
  const isWrap = wrap === "wrap" || wrap === "wrap-reverse";
  const isWrapReverse = wrap === "wrap-reverse";

  const pad = parsePadding(containerStyle);
  const gaps = parseGap(containerStyle);
  const mainGap = isRow ? gaps.col : gaps.row;
  const crossGap = isRow ? gaps.row : gaps.col;

  const innerW = Math.max(0, containerBox.width - pad.left - pad.right);
  const innerH =
    containerBox.height > 0
      ? Math.max(0, containerBox.height - pad.top - pad.bottom)
      : 0;
  const containerMainSize = isRow ? innerW : innerH;
  const containerCrossSize = isRow ? innerH : innerW;

  // 1. Gather in-flow items
  const inFlowItems = [];
  for (const child of children) {
    const tag = String(child.tag ?? "div").toLowerCase();
    if (isSkipTag(tag)) continue;
    const cStyle = parseInlineStyle(child.style);
    if (cStyle.display === "none" || cStyle.visibility === "hidden") continue;
    if (cStyle.position === "absolute" || cStyle.position === "fixed") continue;

    const margin = parseMargin(cStyle);
    const flexShort = parseFlexShorthand(cStyle.flex);
    const grow = flexShort ? flexShort.grow : toPx(cStyle.flexGrow, 0) ?? 0;
    const shrink = flexShort ? flexShort.shrink : toPx(cStyle.flexShrink, 1) ?? 1;
    const basisVal = flexShort ? flexShort.basis : cStyle.flexBasis;

    // Resolve base main size
    let baseMain = null;
    if (basisVal != null && basisVal !== "auto") {
      if (String(basisVal).endsWith("%") && containerMainSize > 0) {
        baseMain = containerMainSize * (Number.parseFloat(basisVal) / 100);
      } else {
        baseMain = toPx(basisVal, 0);
      }
    }
    if (baseMain == null) {
      if (isRow) {
        if (cStyle.width != null && String(cStyle.width).endsWith("%") && containerMainSize > 0) {
          baseMain = containerMainSize * (Number.parseFloat(cStyle.width) / 100);
        } else {
          baseMain = toPx(cStyle.width) ?? contentWidth(child, cStyle, containerMainSize);
        }
      } else {
        if (cStyle.height != null && String(cStyle.height).endsWith("%") && containerMainSize > 0) {
          baseMain = containerMainSize * (Number.parseFloat(cStyle.height) / 100);
        } else {
          baseMain = toPx(cStyle.height) ?? contentHeight(child, cStyle, containerCrossSize || innerW);
        }
      }
    }

    // Resolve base cross size
    let baseCross = null;
    if (isRow) {
      if (cStyle.height != null && String(cStyle.height).endsWith("%") && containerCrossSize > 0) {
        baseCross = containerCrossSize * (Number.parseFloat(cStyle.height) / 100);
      } else {
        baseCross = toPx(cStyle.height) ?? contentHeight(child, cStyle, baseMain);
      }
    } else {
      if (cStyle.width != null && String(cStyle.width).endsWith("%") && containerCrossSize > 0) {
        baseCross = containerCrossSize * (Number.parseFloat(cStyle.width) / 100);
      } else {
        baseCross = toPx(cStyle.width) ?? contentWidth(child, cStyle, containerCrossSize || innerW);
      }
    }

    inFlowItems.push({
      child,
      style: cStyle,
      margin,
      flexGrow: grow,
      flexShrink: shrink,
      baseMainSize: Math.max(0, baseMain ?? 0),
      baseCrossSize: Math.max(0, baseCross ?? 0),
      mainSize: Math.max(0, baseMain ?? 0),
      crossSize: Math.max(0, baseCross ?? 0),
      mainMarginStart: isRow ? margin.left : margin.top,
      mainMarginEnd: isRow ? margin.right : margin.bottom,
      crossMarginStart: isRow ? margin.top : margin.left,
      crossMarginEnd: isRow ? margin.bottom : margin.right,
      alignSelf: cStyle.alignSelf ?? "auto",
      hasExplicitCross: isRow ? cStyle.height != null : cStyle.width != null,
    });
  }

  if (inFlowItems.length === 0) {
    return { childBoxes, contentWidth: 0, contentHeight: 0 };
  }

  // 2. Line breaking
  const lines = [];
  if (!isWrap) {
    lines.push(inFlowItems);
  } else {
    let currentLine = [];
    let currentLineWidth = 0;
    for (const item of inFlowItems) {
      const itemOuterMain = item.baseMainSize + item.mainMarginStart + item.mainMarginEnd;
      const gapToAdd = currentLine.length > 0 ? mainGap : 0;
      if (
        currentLine.length > 0 &&
        containerMainSize > 0 &&
        currentLineWidth + gapToAdd + itemOuterMain > containerMainSize
      ) {
        lines.push(currentLine);
        currentLine = [item];
        currentLineWidth = itemOuterMain;
      } else {
        currentLine.push(item);
        currentLineWidth += gapToAdd + itemOuterMain;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);
  }

  // 3. Resolve flex grow / shrink and cross size for each line
  const lineInfos = [];
  for (const line of lines) {
    const lineMainOuter =
      line.reduce((sum, it) => sum + it.baseMainSize + it.mainMarginStart + it.mainMarginEnd, 0) +
      Math.max(0, line.length - 1) * mainGap;
    const freeMain = containerMainSize > 0 ? containerMainSize - lineMainOuter : 0;

    if (freeMain > 0) {
      const totalGrow = line.reduce((sum, it) => sum + it.flexGrow, 0);
      if (totalGrow > 0) {
        for (const it of line) {
          it.mainSize = it.baseMainSize + (it.flexGrow / totalGrow) * freeMain;
        }
      }
    } else if (freeMain < 0) {
      const totalScaledShrink = line.reduce((sum, it) => sum + it.flexShrink * it.baseMainSize, 0);
      if (totalScaledShrink > 0) {
        const shrinkSpace = Math.abs(freeMain);
        for (const it of line) {
          const shrinkAmt = (it.flexShrink * it.baseMainSize / totalScaledShrink) * shrinkSpace;
          it.mainSize = Math.max(0, it.baseMainSize - shrinkAmt);
        }
      }
    }

    let lineCross = Math.max(
      ...line.map((it) => it.baseCrossSize + it.crossMarginStart + it.crossMarginEnd),
      0,
    );
    if (!isWrap && containerCrossSize > 0 && lineCross < containerCrossSize) {
      lineCross = containerCrossSize;
    }

    for (const it of line) {
      const align = it.alignSelf !== "auto" ? it.alignSelf : (containerStyle.alignItems ?? "stretch");
      if (align === "stretch" && !it.hasExplicitCross && lineCross > 0) {
        it.crossSize = Math.max(0, lineCross - it.crossMarginStart - it.crossMarginEnd);
      }
    }

    lineInfos.push({ line, crossSize: lineCross });
  }

  // 4. Distribute lines along cross axis (alignContent)
  const totalLinesCross =
    lineInfos.reduce((sum, l) => sum + l.crossSize, 0) +
    Math.max(0, lineInfos.length - 1) * crossGap;
  const freeCross = containerCrossSize > 0 ? containerCrossSize - totalLinesCross : 0;
  const alignContent = String(containerStyle.alignContent ?? "flex-start").toLowerCase();

  let crossOffset = 0;
  let lineSpacing = crossGap;
  if (lines.length > 1 && freeCross > 0) {
    if (alignContent === "center") {
      crossOffset = freeCross / 2;
    } else if (alignContent === "flex-end" || alignContent === "end") {
      crossOffset = freeCross;
    } else if (alignContent === "space-between") {
      lineSpacing = crossGap + freeCross / (lines.length - 1);
    } else if (alignContent === "space-around") {
      const sp = freeCross / lines.length;
      crossOffset = sp / 2;
      lineSpacing = crossGap + sp;
    } else if (alignContent === "space-evenly") {
      const sp = freeCross / (lines.length + 1);
      crossOffset = sp;
      lineSpacing = crossGap + sp;
    } else if (alignContent === "stretch") {
      const extraPerLine = freeCross / lines.length;
      for (const li of lineInfos) li.crossSize += extraPerLine;
    }
  }

  const orderedLineInfos = isWrapReverse ? [...lineInfos].reverse() : lineInfos;

  // 5. Position items in document space
  const justify = String(containerStyle.justifyContent ?? "flex-start").toLowerCase();
  const defaultAlign = String(containerStyle.alignItems ?? "stretch").toLowerCase();

  let currentLineCrossPos = crossOffset;
  let maxDocX = containerBox.x;
  let maxDocY = containerBox.y;

  for (const { line, crossSize: lineCross } of orderedLineInfos) {
    const lineMainTotal =
      line.reduce((sum, it) => sum + it.mainSize + it.mainMarginStart + it.mainMarginEnd, 0) +
      Math.max(0, line.length - 1) * mainGap;
    const freeMainInLine = containerMainSize > 0 ? containerMainSize - lineMainTotal : 0;

    let mainStartOffset = 0;
    let itemSpacing = mainGap;

    if (freeMainInLine > 0) {
      if (justify === "center") {
        mainStartOffset = freeMainInLine / 2;
      } else if (justify === "flex-end" || justify === "end") {
        mainStartOffset = freeMainInLine;
      } else if (justify === "space-between" && line.length > 1) {
        itemSpacing = mainGap + freeMainInLine / (line.length - 1);
      } else if (justify === "space-around") {
        const sp = freeMainInLine / line.length;
        mainStartOffset = sp / 2;
        itemSpacing = mainGap + sp;
      } else if (justify === "space-evenly") {
        const sp = freeMainInLine / (line.length + 1);
        mainStartOffset = sp;
        itemSpacing = mainGap + sp;
      }
    }

    const orderedItems = isReverse ? [...line].reverse() : line;
    let currentMainPos = mainStartOffset;

    for (const item of orderedItems) {
      const align = item.alignSelf !== "auto" ? item.alignSelf : defaultAlign;
      const crossSpace = lineCross - (item.crossSize + item.crossMarginStart + item.crossMarginEnd);

      let itemCrossPos = currentLineCrossPos + item.crossMarginStart;
      if (align === "center") {
        itemCrossPos += Math.max(0, crossSpace / 2);
      } else if (align === "flex-end" || align === "end") {
        itemCrossPos += Math.max(0, crossSpace);
      }

      const itemMainPos = currentMainPos + item.mainMarginStart;
      const docX = isRow
        ? containerBox.x + pad.left + itemMainPos
        : containerBox.x + pad.left + itemCrossPos;
      const docY = isRow
        ? containerBox.y + pad.top + itemCrossPos
        : containerBox.y + pad.top + itemMainPos;
      const width = isRow ? item.mainSize : item.crossSize;
      const height = isRow ? item.crossSize : item.mainSize;

      childBoxes.set(item.child, {
        x: Math.round(docX),
        y: Math.round(docY),
        width: Math.round(width),
        height: Math.round(height),
        absolute: false,
      });

      maxDocX = Math.max(maxDocX, docX + width + (isRow ? item.mainMarginEnd : item.crossMarginEnd));
      maxDocY = Math.max(maxDocY, docY + height + (isRow ? item.crossMarginEnd : item.mainMarginEnd));

      currentMainPos += item.mainMarginStart + item.mainSize + item.mainMarginEnd + itemSpacing;
    }

    currentLineCrossPos += lineCross + lineSpacing;
  }

  const contentWidthOut = Math.max(0, maxDocX - containerBox.x + pad.right);
  const contentHeightOut = Math.max(0, maxDocY - containerBox.y + pad.bottom);

  return {
    childBoxes,
    contentWidth: contentWidthOut,
    contentHeight: contentHeightOut,
  };
}
