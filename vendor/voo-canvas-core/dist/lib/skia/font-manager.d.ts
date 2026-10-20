import type { CanvasKitApi, SkiaParagraph } from "./canvas-kit-types.js";
export interface SkiaTextRun {
    text: string;
    color: string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    fontWeight: number;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    letterSpacing: number;
    maxLines?: number;
    ellipsis?: string;
    align: "left" | "center" | "right" | "justify";
    direction: "ltr" | "rtl";
}
export declare class SkiaFontManager {
    private readonly canvasKit;
    private readonly fonts;
    private readonly pending;
    private readonly loadedUrls;
    private provider;
    constructor(canvasKit: CanvasKitApi);
    registerFont(family: string, bytes: ArrayBuffer): void;
    loadFont(family: string, url: string): Promise<void>;
    hasFont(family: string): boolean;
    createParagraph(run: SkiaTextRun, width: number): SkiaParagraph | null;
    private resolveFontWeight;
    waitForPending(): Promise<void>;
    dispose(): void;
}
//# sourceMappingURL=font-manager.d.ts.map