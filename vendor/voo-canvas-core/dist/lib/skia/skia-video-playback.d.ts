import type { SceneElement, SceneNode, ScenePoint, SceneViewport } from "./scene-types.js";
export type SkiaVideoPlaybackStatus = "loading" | "ready" | "playing" | "paused" | "ended" | "error";
export interface SkiaVideoPlaybackState {
    id: string;
    kind: "node" | "lightbox";
    nodeId?: string;
    url: string;
    status: SkiaVideoPlaybackStatus;
    currentTime: number;
    duration: number;
    error: string | null;
}
export type SkiaVideoPlaybackAction = {
    kind: "toggle";
    playbackId: string;
} | {
    kind: "seek";
    playbackId: string;
    fraction: number;
};
export interface SkiaVideoControlLayout {
    content: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    play: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    track: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
}
export declare function isSkiaVideoNode(node: Pick<SceneNode, "nodeType" | "shape" | "videoUrl">): boolean;
export declare function layoutSkiaVideoNodeControls(node: Pick<SceneNode, "bounds" | "shape">): SkiaVideoControlLayout;
export declare function layoutSkiaVideoLightboxControls(viewport: SceneViewport): SkiaVideoControlLayout;
export declare function hitTestSkiaVideoPlayback(states: readonly SkiaVideoPlaybackState[], elements: ReadonlyMap<string, SceneElement>, viewport: SceneViewport, screenPoint: ScenePoint): SkiaVideoPlaybackAction | null;
//# sourceMappingURL=skia-video-playback.d.ts.map