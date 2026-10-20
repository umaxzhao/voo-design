// Deterministic structured design rule evaluation seam.
import { NODE_KIND } from "../../../editor/scene_doc_factory.js";
import { resolveEffectiveBrand } from "../../../agent-runtime/global-memory.js";
import { getSafeMargin, isBackgroundNode } from "./critique-document.js";
import { parseRgb, getContrastRatio } from "./critique-color.js";
import { textBackgroundColor } from "./critique-background.js";

export function evaluateDeterministicRules(doc, args = {}) {
  const issues = [];
  if (!doc) return issues;

  const projectBrief = args?.projectBrief ?? doc?.projectBrief ?? null;
  const globalBrands = args?.globalBrands ?? doc?.globalBrands ?? [];
  const effectiveBrand = projectBrief
    ? resolveEffectiveBrand(projectBrief, globalBrands)
    : null;
  const brand =
    args?.brand ?? doc?.brand ?? effectiveBrand ?? projectBrief?.brand ?? null;
  const forbiddenList = Array.isArray(brand?.forbidden)
    ? brand.forbidden
    : Array.isArray(args?.forbidden)
      ? args.forbidden
      : Array.isArray(doc?.forbidden)
        ? doc.forbidden
        : [];

  const docWidth = Number(doc.width ?? doc.w ?? 0);
  const docHeight = Number(doc.height ?? doc.h ?? 0);
  const nodes = Array.isArray(doc.nodes)
    ? doc.nodes
    : Array.isArray(doc.layers)
      ? doc.layers
      : [];
  const targetWidth =
    args?.targetSpecs?.width ??
    doc?.targetSpecs?.width ??
    args?.targetWidth ??
    doc?.targetWidth;
  const targetHeight =
    args?.targetSpecs?.height ??
    doc?.targetSpecs?.height ??
    args?.targetHeight ??
    doc?.targetHeight;

  if (
    targetWidth != null &&
    targetHeight != null &&
    docWidth > 0 &&
    docHeight > 0 &&
    (docWidth !== Number(targetWidth) || docHeight !== Number(targetHeight))
  ) {
    issues.push({
      id: `issue_dimension_mismatch_${doc.id || "doc"}`,
      targetType: "document",
      targetId: String(doc.id || "document"),
      region: { x: 0, y: 0, w: docWidth, h: docHeight },
      rule: "dimension_mismatch",
      severity: "error",
      evidence: `Document dimensions (${docWidth}x${docHeight}) do not match requested target specifications (${targetWidth}x${targetHeight}).`,
      suggestion: `Resize document canvas to the target dimensions ${targetWidth}x${targetHeight}.`,
    });
  }

  const safeMargin = getSafeMargin(doc, args, brand);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const x = Number(node.x ?? 0);
    const y = Number(node.y ?? 0);
    const w = Number(node.width ?? node.w ?? 0);
    const h = Number(node.height ?? node.h ?? 0);
    const region = { x, y, w, h };
    const targetId = String(node.id || `node_${i}`);
    const isText =
      node.kind === NODE_KIND.TEXT ||
      node.kind === "text" ||
      node.type === "text" ||
      Boolean(node.text);
    const isBg = isBackgroundNode(node, docWidth, docHeight);

    if (
      isText &&
      docWidth > 0 &&
      docHeight > 0 &&
      (x < 0 || y < 0 || x + w > docWidth || y + h > docHeight)
    ) {
      issues.push({
        id: `issue_text_overflow_${targetId}`,
        targetType: "node",
        targetId,
        region,
        rule: "text_overflow",
        severity: "error",
        evidence: `Text element "${node.name || node.text || targetId}" at (${x}, ${y}, ${w}x${h}) extends outside canvas boundaries (${docWidth}x${docHeight}).`,
        suggestion: `Adjust text position or bounding size to stay fully within canvas bounds (0, 0, ${docWidth}, ${docHeight}).`,
      });
    }
    if (!isBg && docWidth > 0 && docHeight > 0) {
      const outsideSafeMargin =
        x < safeMargin.left ||
        y < safeMargin.top ||
        x + w > docWidth - safeMargin.right ||
        y + h > docHeight - safeMargin.bottom;
      if (outsideSafeMargin)
        issues.push({
          id: `issue_safe_margin_${targetId}`,
          targetType: "node",
          targetId,
          region,
          rule: "safe_margin_exceeded",
          severity: "warning",
          evidence: `Element "${node.name || targetId}" at (${x}, ${y}, ${w}x${h}) breaches safe margin of ${safeMargin.left}px.`,
          suggestion: `Position element inside safe bounds ([${safeMargin.left}, ${safeMargin.top}] to [${docWidth - safeMargin.right}, ${docHeight - safeMargin.bottom}]).`,
        });
    }
    if (isText) {
      const textColorStr =
        node.color ??
        node.fill ??
        node.textColor ??
        node.style?.color ??
        "#000000";
      const bgColorStr = textBackgroundColor(
        node,
        i,
        nodes,
        doc.backgroundColor ?? args?.backgroundColor ?? "#ffffff",
      );
      const textRgb = parseRgb(textColorStr);
      const bgRgb = parseRgb(bgColorStr);
      if (textRgb && bgRgb) {
        const ratio = getContrastRatio(textRgb, bgRgb);
        const fontSize = Number(node.fontSize ?? node.style?.fontSize ?? 16);
        const isBold =
          node.fontWeight === "bold" ||
          Number(node.fontWeight) >= 700 ||
          node.style?.fontWeight === "bold";
        const threshold =
          fontSize >= 24 || (fontSize >= 18 && isBold) ? 3.0 : 4.5;
        if (ratio < threshold)
          issues.push({
            id: `issue_contrast_${targetId}`,
            targetType: "node",
            targetId,
            region,
            rule: "insufficient_contrast",
            severity: "error",
            evidence: `Text contrast ratio of ${ratio.toFixed(2)}:1 between "${textColorStr}" and "${bgColorStr}" is below WCAG threshold of ${threshold}:1.`,
            suggestion: `Increase contrast between text and background to at least ${threshold}:1.`,
          });
      }
    }
    const brandSafeArea =
      brand?.safeArea ??
      args?.projectBrief?.brand?.safeArea ??
      doc?.projectBrief?.brand?.safeArea;
    if (
      brandSafeArea &&
      typeof brandSafeArea === "object" &&
      !isBg &&
      docWidth > 0 &&
      docHeight > 0
    ) {
      const bTop = Number(brandSafeArea.top ?? 0);
      const bRight = Number(brandSafeArea.right ?? 0);
      const bBottom = Number(brandSafeArea.bottom ?? 0);
      const bLeft = Number(brandSafeArea.left ?? 0);
      const breaches =
        x < bLeft ||
        y < bTop ||
        x + w > docWidth - bRight ||
        y + h > docHeight - bBottom;
      if ((bTop > 0 || bRight > 0 || bBottom > 0 || bLeft > 0) && breaches)
        issues.push({
          id: `issue_brand_safe_area_${targetId}`,
          targetType: "node",
          targetId,
          region,
          rule: "brand_safe_area_exceeded",
          severity: "error",
          evidence: `Element "${node.name || targetId}" at (${x}, ${y}, ${w}x${h}) extends outside brand safeArea (top: ${bTop}px, right: ${bRight}px, bottom: ${bBottom}px, left: ${bLeft}px).`,
          suggestion: `Position element within brand safe area bounds ([${bLeft}, ${bTop}] to [${docWidth - bRight}, ${docHeight - bBottom}]).`,
        });
    }
    if (forbiddenList.length > 0) {
      const nodeColors = [
        node.color,
        node.fill,
        node.textColor,
        node.backgroundColor,
        node.bg,
        node.style?.color,
        node.style?.fill,
        node.style?.backgroundColor,
        node.borderColor,
        node.stroke,
      ].filter((c) => typeof c === "string" && c.trim().length > 0);
      const nodeFonts = [
        node.fontFamily,
        node.font,
        node.style?.fontFamily,
        node.style?.font,
      ].filter((f) => typeof f === "string" && f.trim().length > 0);
      for (const rawForbidden of forbiddenList) {
        if (!rawForbidden) continue;
        const forbiddenItem = String(rawForbidden).trim();
        const forbiddenLower = forbiddenItem.toLowerCase();
        const forbiddenRgb = parseRgb(forbiddenLower);
        let matchedColor = null;
        for (const col of nodeColors) {
          const colLower = col.trim().toLowerCase();
          const colRgb = forbiddenRgb ? parseRgb(colLower) : null;
          if (
            colLower === forbiddenLower ||
            (colRgb &&
              colRgb.r === forbiddenRgb.r &&
              colRgb.g === forbiddenRgb.g &&
              colRgb.b === forbiddenRgb.b)
          ) {
            matchedColor = col;
            break;
          }
        }
        if (matchedColor)
          issues.push({
            id: `issue_brand_forbidden_${targetId}_color_${encodeURIComponent(forbiddenItem)}`,
            targetType: "node",
            targetId,
            region,
            rule: "brand_forbidden",
            severity: "error",
            evidence: `Element "${node.name || targetId}" uses forbidden brand color "${matchedColor}" (violates brand constraint "${forbiddenItem}").`,
            suggestion: `Replace color "${matchedColor}" with an approved brand color from project brief.`,
          });
        if (isText || nodeFonts.length > 0) {
          let matchedFont = null;
          for (const f of nodeFonts) {
            const fLower = f.trim().toLowerCase();
            if (
              fLower === forbiddenLower ||
              fLower.includes(forbiddenLower) ||
              forbiddenLower.includes(fLower)
            ) {
              matchedFont = f;
              break;
            }
          }
          if (matchedFont)
            issues.push({
              id: `issue_brand_forbidden_${targetId}_font_${encodeURIComponent(forbiddenItem)}`,
              targetType: "node",
              targetId,
              region,
              rule: "brand_forbidden",
              severity: "error",
              evidence: `Text element "${node.name || targetId}" uses forbidden brand font "${matchedFont}" (violates brand constraint "${forbiddenItem}").`,
              suggestion: `Replace font "${matchedFont}" with an approved brand font from project brief.`,
            });
        }
      }
    }
  }

  const nonBgNodes = nodes.filter(
    (n) => !isBackgroundNode(n, docWidth, docHeight),
  );
  const groups = new Map();
  for (const n of nonBgNodes) {
    const gid = n.groupId || n.parentId || "default_artboard";
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid).push(n);
  }
  for (const groupNodes of groups.values()) {
    if (groupNodes.length < 2) continue;
    for (let i = 0; i < groupNodes.length; i++)
      for (let j = i + 1; j < groupNodes.length; j++) {
        const a = groupNodes[i];
        const b = groupNodes[j];
        const ax = Number(a.x ?? 0);
        const ay = Number(a.y ?? 0);
        const aw = Number(a.width ?? a.w ?? 0);
        const ah = Number(a.height ?? a.h ?? 0);
        const bx = Number(b.x ?? 0);
        const by = Number(b.y ?? 0);
        const bw = Number(b.width ?? b.w ?? 0);
        const bh = Number(b.height ?? b.h ?? 0);
        const differences = [
          [Math.abs(ax - bx), "left", bx, ax],
          [Math.abs(ax + aw - (bx + bw)), "right", bx + bw, ax + aw],
          [
            Math.abs(ax + aw / 2 - (bx + bw / 2)),
            "center-x",
            bx + bw / 2,
            ax + aw / 2,
          ],
          [Math.abs(ay - by), "top", by, ay],
          [Math.abs(ay + ah - (by + bh)), "bottom", by + bh, ay + ah],
          [
            Math.abs(ay + ah / 2 - (by + bh / 2)),
            "center-y",
            by + bh / 2,
            ay + ah / 2,
          ],
        ];
        const match = differences.find(([diff]) => diff >= 1 && diff <= 4);
        if (match) {
          const [diff, edge, targetCoord, currentCoord] = match;
          const targetId = String(a.id || `node_${i}`);
          issues.push({
            id: `issue_misalignment_${targetId}_${b.id || j}_${edge}`,
            targetType: "node",
            targetId,
            region: { x: ax, y: ay, w: aw, h: ah },
            rule: "misalignment",
            severity: "warning",
            evidence: `Element "${a.name || targetId}" ${edge} edge (${currentCoord}px) is misaligned by ${diff}px with "${b.name || b.id || j}" (${targetCoord}px).`,
            suggestion: `Snap "${a.name || targetId}" ${edge} edge to ${targetCoord}px for clean alignment.`,
          });
        }
      }
  }
  return issues;
}
