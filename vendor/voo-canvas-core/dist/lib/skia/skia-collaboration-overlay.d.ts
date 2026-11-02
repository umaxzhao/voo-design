import type { PeerCursor } from "../collab-types.js";
import type { SceneBounds } from "./scene-types.js";
export declare const REMOTE_CURSOR_LEAVE_FADE_MS = 300;
export declare const REMOTE_CURSOR_GHOST_TTL_MS: number;
export interface SkiaRemoteCursorState {
    peerId: string;
    x: number;
    y: number;
    color: string;
    label: string;
    leavingAt?: number;
}
export interface SkiaPeerSelectionState extends SceneBounds {
    key: string;
    rotation: number;
    color: string;
    peerName: string;
    showLabel: boolean;
    stackIndex: number;
}
export interface RemoteCursorStep {
    position: PeerCursor;
    settled: boolean;
}
/**
 * Advance one network cursor sample toward its target. Keeping the math in
 * the Skia model makes cursor motion deterministic and independently tested;
 * React only schedules frames and publishes the resulting positions.
 */
export declare function advanceRemoteCursor(current: PeerCursor | null, target: PeerCursor, reducedMotion: boolean): RemoteCursorStep;
export declare function remoteCursorOpacity(leavingAt: number | undefined, timestampMs: number): number;
//# sourceMappingURL=skia-collaboration-overlay.d.ts.map