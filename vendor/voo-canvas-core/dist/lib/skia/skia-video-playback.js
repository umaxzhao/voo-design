import { AI_NODE_LAYOUT } from "../ai-node-layout.js";
import { layoutSkiaGalleryLightbox } from "./skia-gallery-lightbox.js";
import { screenToWorld } from "./scene-geometry.js";
export function isSkiaVideoNode(node) {
    return (node.nodeType === "video" ||
        node.shape === "video" ||
        (node.nodeType === "video-gen" && Boolean(node.videoUrl)));
}
const CONTROL_HEIGHT = 36;
const PLAY_SIZE = 24;
export function layoutSkiaVideoNodeControls(node) {
    const card = node.shape === "card";
    const left = card ? AI_NODE_LAYOUT.contentInset : 0;
    const top = card ? AI_NODE_LAYOUT.contentInset : 0;
    const right = card
        ? node.bounds.width - AI_NODE_LAYOUT.contentInset
        : node.bounds.width;
    const bottom = card
        ? node.bounds.height -
            AI_NODE_LAYOUT.footerHeight -
            AI_NODE_LAYOUT.contentInset
        : node.bounds.height;
    const content = {
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
    };
    const controlTop = Math.max(top, bottom - CONTROL_HEIGHT);
    return {
        content,
        play: {
            left: left + 6,
            top: controlTop + (CONTROL_HEIGHT - PLAY_SIZE) / 2,
            width: PLAY_SIZE,
            height: PLAY_SIZE,
        },
        track: {
            left: left + 38,
            top: controlTop + 14,
            width: Math.max(1, right - left - 46),
            height: 8,
        },
    };
}
export function layoutSkiaVideoLightboxControls(viewport) {
    const image = layoutSkiaGalleryLightbox(viewport).image;
    const controlTop = image.top + image.height - CONTROL_HEIGHT;
    return {
        content: image,
        play: {
            left: image.left + 8,
            top: controlTop + (CONTROL_HEIGHT - PLAY_SIZE) / 2,
            width: PLAY_SIZE,
            height: PLAY_SIZE,
        },
        track: {
            left: image.left + 42,
            top: controlTop + 14,
            width: Math.max(1, image.width - 52),
            height: 8,
        },
    };
}
function contains(bounds, point) {
    return (point.x >= bounds.left &&
        point.x <= bounds.left + bounds.width &&
        point.y >= bounds.top &&
        point.y <= bounds.top + bounds.height);
}
function toNodeLocal(node, worldPoint) {
    const centerX = node.bounds.x + node.bounds.width / 2;
    const centerY = node.bounds.y + node.bounds.height / 2;
    const radians = (-(node.rotation ?? 0) * Math.PI) / 180;
    const dx = worldPoint.x - centerX;
    const dy = worldPoint.y - centerY;
    const rotated = {
        x: dx * Math.cos(radians) - dy * Math.sin(radians),
        y: dx * Math.sin(radians) + dy * Math.cos(radians),
    };
    return {
        x: node.bounds.width / 2 + (node.flipX ? -rotated.x : rotated.x),
        y: node.bounds.height / 2 + (node.flipY ? -rotated.y : rotated.y),
    };
}
function actionAt(playbackId, layout, point) {
    if (contains(layout.play, point))
        return { kind: "toggle", playbackId };
    if (contains(layout.track, point)) {
        return {
            kind: "seek",
            playbackId,
            fraction: Math.max(0, Math.min(1, (point.x - layout.track.left) / layout.track.width)),
        };
    }
    if (contains(layout.content, point))
        return { kind: "toggle", playbackId };
    return null;
}
export function hitTestSkiaVideoPlayback(states, elements, viewport, screenPoint) {
    const lightbox = [...states]
        .reverse()
        .find((state) => state.kind === "lightbox");
    if (lightbox) {
        return actionAt(lightbox.id, layoutSkiaVideoLightboxControls(viewport), screenPoint);
    }
    const worldPoint = screenToWorld(screenPoint, viewport);
    for (let index = states.length - 1; index >= 0; index -= 1) {
        const state = states[index];
        if (state.kind !== "node" || !state.nodeId)
            continue;
        const element = elements.get(state.nodeId);
        if (!element || element.kind !== "node" || !element.visible)
            continue;
        const localPoint = toNodeLocal(element, worldPoint);
        const action = actionAt(state.id, layoutSkiaVideoNodeControls(element), localPoint);
        if (action)
            return action;
    }
    return null;
}
//# sourceMappingURL=skia-video-playback.js.map