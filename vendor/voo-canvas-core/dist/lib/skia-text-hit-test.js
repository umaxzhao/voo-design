const LINE_ALIGNMENT_TOLERANCE = 0.5;
function getCaretLines(layout) {
    const carets = layout.caretRects
        .map((rect, index) => (rect ? { index, rect } : null))
        .filter((caret) => caret !== null)
        .sort((left, right) => (left.rect.top + left.rect.bottom) / 2 -
        (right.rect.top + right.rect.bottom) / 2 || left.index - right.index);
    return carets.reduce((lines, caret) => {
        const centerY = (caret.rect.top + caret.rect.bottom) / 2;
        const currentLine = lines.at(-1);
        if (currentLine &&
            Math.abs(currentLine.centerY - centerY) <= LINE_ALIGNMENT_TOLERANCE) {
            currentLine.carets.push(caret);
            currentLine.top = Math.min(currentLine.top, caret.rect.top);
            currentLine.bottom = Math.max(currentLine.bottom, caret.rect.bottom);
            return lines;
        }
        lines.push({
            carets: [caret],
            top: caret.rect.top,
            bottom: caret.rect.bottom,
            centerY,
        });
        return lines;
    }, []);
}
function getClosestCaretLine(lines, localY) {
    if (lines.length === 0)
        return null;
    if (localY <= lines[0].top)
        return lines[0];
    if (localY >= lines[lines.length - 1].bottom)
        return lines[lines.length - 1];
    return lines.reduce((closest, line) => {
        const closestDistance = localY < closest.top
            ? closest.top - localY
            : localY > closest.bottom
                ? localY - closest.bottom
                : 0;
        const lineDistance = localY < line.top ? line.top - localY : localY > line.bottom ? localY - line.bottom : 0;
        return lineDistance < closestDistance ? line : closest;
    });
}
export function getTextIndexAtLayoutPoint(layout, localX, localY) {
    const line = getClosestCaretLine(getCaretLines(layout), localY);
    if (!line)
        return 0;
    // Resolve the visual line before X. A two-dimensional nearest-neighbour
    // search can jump to another line while a drag crosses the line gap.
    const closestCaret = line.carets.reduce((closest, caret) => Math.abs(caret.rect.left - localX) < Math.abs(closest.rect.left - localX)
        ? caret
        : closest);
    return Math.max(0, Math.min(layout.textLength, closestCaret.index));
}
export function getSelectionBoundingRectsFromLayout(layout, start, end) {
    const min = Math.max(0, Math.min(start, end));
    const max = Math.min(layout.textLength, Math.max(start, end));
    if (min === max)
        return [];
    return layout.glyphRects.slice(min, max).filter((rect) => rect !== null);
}
export function moveCaretVerticallyFromLayout(layout, index, direction) {
    const current = layout.caretRects[index];
    if (!current)
        return index;
    const currentY = (current.top + current.bottom) / 2;
    const candidates = layout.caretRects
        .map((rect, candidateIndex) => ({ rect, candidateIndex }))
        .filter((candidate) => candidate.rect !== null &&
        (direction === "up"
            ? (candidate.rect.top + candidate.rect.bottom) / 2 < currentY - 0.5
            : (candidate.rect.top + candidate.rect.bottom) / 2 > currentY + 0.5));
    if (candidates.length === 0)
        return index;
    const targetY = direction === "up"
        ? Math.max(...candidates.map(({ rect }) => (rect.top + rect.bottom) / 2))
        : Math.min(...candidates.map(({ rect }) => (rect.top + rect.bottom) / 2));
    return candidates.reduce((best, candidate) => {
        const candidateY = (candidate.rect.top + candidate.rect.bottom) / 2;
        const bestY = (best.rect.top + best.rect.bottom) / 2;
        if (Math.abs(candidateY - targetY) < Math.abs(bestY - targetY))
            return candidate;
        if (Math.abs(candidateY - targetY) > Math.abs(bestY - targetY))
            return best;
        return Math.abs(candidate.rect.left - current.left) <
            Math.abs(best.rect.left - current.left)
            ? candidate
            : best;
    }).candidateIndex;
}
export function moveCaretToLineBoundaryFromLayout(layout, index, direction) {
    const current = layout.caretRects[index];
    if (!current)
        return index;
    const currentY = (current.top + current.bottom) / 2;
    const sameLine = layout.caretRects
        .map((rect, candidateIndex) => ({ rect, candidateIndex }))
        .filter((candidate) => candidate.rect !== null &&
        Math.abs((candidate.rect.top + candidate.rect.bottom) / 2 - currentY) < 0.5);
    if (sameLine.length === 0)
        return index;
    return sameLine.reduce((boundary, candidate) => direction === "home"
        ? candidate.rect.left < boundary.rect.left
            ? candidate
            : boundary
        : candidate.rect.left > boundary.rect.left
            ? candidate
            : boundary).candidateIndex;
}
export function getTextIndexAtPointMultiline(text, fontSize, localX, localY, lineHeightMultiplier = 1.2) {
    const lines = text.split("\n");
    const lineHeight = fontSize * lineHeightMultiplier;
    const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(localY / lineHeight)));
    let precedingCharCount = 0;
    for (let i = 0; i < lineIndex; i++) {
        precedingCharCount += lines[i].length + 1;
    }
    const currentLine = lines[lineIndex] || "";
    const charWidth = fontSize * 0.55;
    const charOffset = Math.max(0, Math.min(currentLine.length, Math.round(localX / charWidth)));
    return precedingCharCount + charOffset;
}
export function getSelectionBoundingRectsMultiline(text, fontSize, start, end, lineHeightMultiplier = 1.2) {
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    if (min === max)
        return [];
    const charWidth = fontSize * 0.55;
    const lineHeight = fontSize * lineHeightMultiplier;
    const lines = text.split("\n");
    const rects = [];
    let currentOffset = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineStart = currentOffset;
        const lineEnd = currentOffset + line.length;
        if (max > lineStart && min < lineEnd) {
            const lineMin = Math.max(min, lineStart) - lineStart;
            const lineMax = Math.min(max, lineEnd) - lineStart;
            rects.push({
                x: lineMin * charWidth,
                y: i * lineHeight,
                width: Math.max(2, (lineMax - lineMin) * charWidth),
                height: lineHeight,
            });
        }
        currentOffset = lineEnd + 1;
    }
    return rects;
}
//# sourceMappingURL=skia-text-hit-test.js.map