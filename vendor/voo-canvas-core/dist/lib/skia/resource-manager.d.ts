import type { CanvasKitApi, SkiaImage } from "./canvas-kit-types.js";
/**
 * Decode a `data:` URL to bytes without going through `fetch`.
 *
 * `fetch` is governed by the CSP `connect-src` directive, which does not list
 * `data:` (see next.config.ts) — so fetching one throws "Failed to fetch" and
 * the image silently never decodes. Every image a Figma import produces is an
 * inline `data:` URL, which is why imported artwork rendered blank while the
 * DOM inspector thumbnail (an `<img>`, governed by the looser `img-src`) still
 * showed it. Decoding inline also skips a needless round-trip through the
 * network stack for payloads that are already in memory.
 */
export declare function decodeDataUrl(url: string): Uint8Array;
export declare class SkiaResourceManager {
    private readonly canvasKit;
    private readonly onInvalidate;
    private readonly images;
    private readonly videoFrames;
    constructor(canvasKit: CanvasKitApi, onInvalidate: () => void);
    preloadImage(url: string): Promise<SkiaImage>;
    getImage(url: string): SkiaImage | null;
    getError(url: string): Error | null;
    updateVideoFrame(id: string, source: CanvasImageSource): void;
    getVideoFrame(id: string): SkiaImage | null;
    releaseVideoFrame(id: string): void;
    waitForImages(urls: readonly string[], timeoutMs: number): Promise<void>;
    releaseImage(url: string): void;
    dispose(): void;
    private loadImage;
    private fetchImageBytes;
}
//# sourceMappingURL=resource-manager.d.ts.map