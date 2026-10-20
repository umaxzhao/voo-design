export const SKIA_CONTEXT_MENU_WIDTH = 220;
export const SKIA_CONTEXT_MENU_ROW_HEIGHT = 32;
export const SKIA_CONTEXT_MENU_PADDING = 6;
export const SKIA_CONTEXT_MENU_MARGIN = 8;
export function layoutSkiaContextMenu(menu, viewport) {
    const width = menu.width ?? SKIA_CONTEXT_MENU_WIDTH;
    const separatorCount = menu.items.filter((item) => item.separatorBefore).length;
    const height = SKIA_CONTEXT_MENU_PADDING * 2 +
        menu.items.reduce((total, item) => total + (item.description ? 48 : SKIA_CONTEXT_MENU_ROW_HEIGHT), 0) +
        separatorCount;
    const preferredLeft = menu.screenX + 4;
    const preferredTop = menu.screenY + 4;
    const left = Math.max(SKIA_CONTEXT_MENU_MARGIN, Math.min(preferredLeft, viewport.width - width - SKIA_CONTEXT_MENU_MARGIN));
    const top = Math.max(SKIA_CONTEXT_MENU_MARGIN, Math.min(preferredTop, viewport.height - height - SKIA_CONTEXT_MENU_MARGIN));
    let rowTop = top + SKIA_CONTEXT_MENU_PADDING;
    const rows = menu.items.map((item, itemIndex) => {
        if (item.separatorBefore)
            rowTop += 1;
        const rowHeight = item.description ? 48 : SKIA_CONTEXT_MENU_ROW_HEIGHT;
        const row = {
            item,
            itemIndex,
            top: rowTop,
            bottom: rowTop + rowHeight,
        };
        rowTop = row.bottom;
        return row;
    });
    return { left, top, width, height, rows };
}
export function hitTestSkiaContextMenu(menu, viewport, point) {
    const layout = layoutSkiaContextMenu(menu, viewport);
    if (point.x < layout.left ||
        point.x > layout.left + layout.width ||
        point.y < layout.top ||
        point.y > layout.top + layout.height) {
        return null;
    }
    const row = layout.rows.find((candidate) => point.y >= candidate.top && point.y < candidate.bottom);
    return row && !row.item.disabled ? row.item : null;
}
export function moveSkiaContextMenuHighlight(menu, direction) {
    const enabled = menu.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !item.disabled)
        .map(({ index }) => index);
    if (enabled.length === 0)
        return { ...menu, highlightedIndex: -1 };
    if (direction === "first")
        return { ...menu, highlightedIndex: enabled[0] };
    if (direction === "last") {
        return { ...menu, highlightedIndex: enabled[enabled.length - 1] };
    }
    const currentPosition = enabled.indexOf(menu.highlightedIndex);
    const nextPosition = currentPosition < 0
        ? direction === 1
            ? 0
            : enabled.length - 1
        : (currentPosition + direction + enabled.length) % enabled.length;
    return { ...menu, highlightedIndex: enabled[nextPosition] };
}
//# sourceMappingURL=skia-context-menu.js.map