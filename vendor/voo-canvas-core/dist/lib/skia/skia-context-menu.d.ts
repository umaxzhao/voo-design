import type { ScenePoint } from "./scene-types.js";
export declare const SKIA_CONTEXT_MENU_WIDTH = 220;
export declare const SKIA_CONTEXT_MENU_ROW_HEIGHT = 32;
export declare const SKIA_CONTEXT_MENU_PADDING = 6;
export declare const SKIA_CONTEXT_MENU_MARGIN = 8;
export interface SkiaContextMenuItem {
    id: string;
    label: string;
    description?: string;
    secondaryLabel?: string;
    disabled?: boolean;
    separatorBefore?: boolean;
    tone?: "default" | "danger" | "warning";
}
export interface SkiaContextMenuState {
    ariaLabel: string;
    screenX: number;
    screenY: number;
    highlightedIndex: number;
    items: readonly SkiaContextMenuItem[];
    width?: number;
}
export interface SkiaContextMenuLayout {
    left: number;
    top: number;
    width: number;
    height: number;
    rows: readonly SkiaContextMenuRowLayout[];
}
export interface SkiaContextMenuRowLayout {
    item: SkiaContextMenuItem;
    itemIndex: number;
    top: number;
    bottom: number;
}
export declare function layoutSkiaContextMenu(menu: SkiaContextMenuState, viewport: {
    width: number;
    height: number;
}): SkiaContextMenuLayout;
export declare function hitTestSkiaContextMenu(menu: SkiaContextMenuState, viewport: {
    width: number;
    height: number;
}, point: ScenePoint): SkiaContextMenuItem | null;
export declare function moveSkiaContextMenuHighlight(menu: SkiaContextMenuState, direction: 1 | -1 | "first" | "last"): SkiaContextMenuState;
//# sourceMappingURL=skia-context-menu.d.ts.map