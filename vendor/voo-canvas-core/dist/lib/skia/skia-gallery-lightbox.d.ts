import type { ScenePoint, SceneViewport } from "./scene-types.js";
export type SkiaGalleryLightboxAction = "close" | "content" | "download";
export interface SkiaGalleryLightboxState {
    url: string;
    mediaType: "image" | "video";
    videoPlaybackId?: string;
    highlightedAction: SkiaGalleryLightboxAction | null;
}
export interface SkiaGalleryLightboxLayout {
    image: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    close: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    download: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
}
export declare function layoutSkiaGalleryLightbox(viewport: SceneViewport): SkiaGalleryLightboxLayout;
export declare function hitTestSkiaGalleryLightbox(viewport: SceneViewport, point: ScenePoint): SkiaGalleryLightboxAction;
//# sourceMappingURL=skia-gallery-lightbox.d.ts.map