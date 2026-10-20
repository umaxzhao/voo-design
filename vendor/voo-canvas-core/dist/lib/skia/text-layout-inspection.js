import { AI_NODE_LAYOUT } from "../ai-node-layout.js";
const AUTO_WIDTH_LAYOUT_BOUND = 1000000;
const LAYOUT_TOLERANCE_PX = 0.5;
function resolveText(node) {
    const bodyParts = [
        node.text,
        node.subtitle,
        node.shape === "card" ? undefined : node.metadata?.join(" · "),
    ].filter((value) => Boolean(value?.trim()));
    const fallback = node.shape === "text"
        ? (node.text ?? "")
        : node.shape === "button"
            ? node.title
            : "";
    return bodyParts.join("\n") || fallback;
}
function isInScope(element, scopeIds, elementsById) {
    if (!scopeIds || scopeIds.size === 0)
        return true;
    let current = element;
    const visited = new Set();
    while (current) {
        if (scopeIds.has(current.id))
            return true;
        if (!("parentId" in current) || !current.parentId)
            return false;
        if (visited.has(current.parentId))
            return false;
        visited.add(current.parentId);
        current = elementsById.get(current.parentId);
    }
    return false;
}
function createTextRun(node, text) {
    const fontSize = node.fontSize ?? 14;
    return {
        text: text || " ",
        color: node.textColor ?? "#111827",
        fontFamily: node.fontFamily ?? "Inter",
        fontSize,
        fontWeight: node.fontWeight ?? 400,
        italic: node.italic,
        underline: node.underline,
        strikethrough: node.strikethrough,
        lineHeight: node.lineHeight ?? fontSize * 1.5,
        letterSpacing: node.letterSpacing ?? 0,
        maxLines: node.maxLines,
        ellipsis: node.ellipsis,
        align: node.textAutoWidth
            ? node.textDirection === "rtl"
                ? "right"
                : "left"
            : (node.textAlign ?? "left"),
        direction: node.textDirection ?? "ltr",
    };
}
export function inspectSceneTextLayouts(elements, fonts, scopeIds) {
    const elementsById = new Map(elements.map((element) => [element.id, element]));
    const scope = scopeIds && scopeIds.length > 0 ? new Set(scopeIds) : null;
    return elements
        .filter((element) => element.kind === "node" &&
        element.visible &&
        element.textVisible !== false &&
        isInScope(element, scope, elementsById))
        .map((node) => inspectNodeTextLayout(node, fonts))
        .filter((inspection) => inspection !== null);
}
function inspectNodeTextLayout(node, fonts) {
    const text = resolveText(node);
    if (!text)
        return null;
    const horizontalInset = node.shape === "card"
        ? AI_NODE_LAYOUT.contentInset * 2
        : node.shape === "button"
            ? 24
            : 0;
    const top = node.shape === "card"
        ? AI_NODE_LAYOUT.contentInset + 8
        : node.shape === "button"
            ? 8
            : 0;
    const bottom = node.shape === "card"
        ? AI_NODE_LAYOUT.footerHeight + AI_NODE_LAYOUT.contentInset
        : node.shape === "button"
            ? 8
            : 0;
    const availableWidth = Math.max(1, node.bounds.width - horizontalInset);
    const availableHeight = Math.max(0, node.bounds.height - top - bottom);
    const paragraphWidth = node.textAutoWidth
        ? AUTO_WIDTH_LAYOUT_BOUND
        : availableWidth;
    const paragraphSpacing = Math.max(0, node.paragraphSpacing ?? 0);
    const paragraphTexts = paragraphSpacing > 0 && !node.maxLines ? text.split("\n") : [text];
    const paragraphs = paragraphTexts.map((paragraphText) => fonts.createParagraph(createTextRun(node, paragraphText), paragraphWidth));
    if (paragraphs.some((paragraph) => paragraph === null)) {
        paragraphs.forEach((paragraph) => paragraph?.delete());
        return {
            nodeId: node.id,
            status: "unsupported",
            reason: "No registered CanvasKit font can shape this text.",
            text,
            fontFamily: node.fontFamily ?? "Inter",
            fontWeight: node.fontWeight ?? 400,
            availableWidth,
            availableHeight,
        };
    }
    const measuredParagraphs = paragraphs.filter((paragraph) => paragraph !== null);
    try {
        const measuredWidth = Math.max(0, ...measuredParagraphs.map((paragraph) => paragraph.getLongestLine()));
        const measuredHeight = measuredParagraphs.reduce((sum, paragraph) => sum + paragraph.getHeight(), 0) +
            paragraphSpacing * Math.max(0, measuredParagraphs.length - 1);
        const unresolvedCodepoints = [
            ...new Set(measuredParagraphs.flatMap((paragraph) => paragraph.unresolvedCodepoints())),
        ];
        const maxLinesExceeded = measuredParagraphs.some((paragraph) => paragraph.didExceedMaxLines());
        const lineCount = measuredParagraphs.reduce((sum, paragraph) => sum + paragraph.getNumberOfLines(), 0);
        const intrinsicParagraph = !node.textAutoWidth && lineCount > 1 && !text.includes("\n")
            ? fonts.createParagraph(createTextRun(node, text), AUTO_WIDTH_LAYOUT_BOUND)
            : null;
        const intrinsicWidth = intrinsicParagraph?.getLongestLine();
        const clipped = maxLinesExceeded ||
            measuredHeight > availableHeight + LAYOUT_TOLERANCE_PX ||
            measuredWidth > availableWidth + LAYOUT_TOLERANCE_PX;
        try {
            return {
                nodeId: node.id,
                status: "measured",
                text,
                fontFamily: node.fontFamily ?? "Inter",
                fontWeight: node.fontWeight ?? 400,
                availableWidth,
                availableHeight,
                measuredWidth,
                ...(typeof intrinsicWidth === "number" ? { intrinsicWidth } : {}),
                measuredHeight,
                lineCount,
                maxLinesExceeded,
                clipped,
                missingGlyphs: unresolvedCodepoints.length > 0,
                unresolvedCodepoints,
            };
        }
        finally {
            intrinsicParagraph?.delete();
        }
    }
    finally {
        measuredParagraphs.forEach((paragraph) => paragraph.delete());
    }
}
//# sourceMappingURL=text-layout-inspection.js.map