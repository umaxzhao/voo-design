import type { CanvasKitApi } from "./canvas-kit-types.js";
/**
 * Where the CanvasKit runtime lives.
 *
 * A site serving the editor from its root wants the defaults. Anything else —
 * a subdirectory, a browser extension, a CDN — has to say so before the first
 * load, because the script tag and the wasm are fetched together and only once.
 */
export interface CanvasKitAssetUrls {
    script: string;
    wasm: string;
}
/** Must be called before `loadCanvasKit`; afterwards it has no effect. */
export declare function setCanvasKitAssetUrls(urls: Partial<CanvasKitAssetUrls>): void;
export declare function loadCanvasKit(): Promise<CanvasKitApi>;
export declare function resetCanvasKitForTests(): void;
//# sourceMappingURL=canvas-kit-loader.d.ts.map