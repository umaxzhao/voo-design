import { loadCanvasKit } from "./canvas-kit-loader.js";
import { SkiaFontManager } from "./font-manager.js";
import { SkiaResourceManager } from "./resource-manager.js";
import { SkiaScenePainter } from "./skia-scene-painter.js";
import { drawSceneElements } from "./skia-scene-draw.js";
import { SkiaExportService } from "./skia-export-service.js";
import { inspectSceneTextLayouts, } from "./text-layout-inspection.js";
import { SkiaContextMenuPainter } from "./skia-context-menu-painter.js";
import { SkiaAgentCursorPainter } from "./skia-agent-cursor-painter.js";
import { SkiaMeasureOverlayPainter } from "./skia-measure-overlay-painter.js";
import { SkiaImageToolbarPainter } from "./skia-image-toolbar-painter.js";
import { SkiaVariantStripPainter } from "./skia-variant-strip-painter.js";
import { SkiaPenDrawOverlayPainter } from "./skia-pen-draw-overlay-painter.js";
import { SkiaPenEditOverlayPainter } from "./skia-pen-edit-overlay-painter.js";
import { SkiaGradientOverlayPainter } from "./skia-gradient-overlay-painter.js";
import { SkiaGalleryLightboxPainter } from "./skia-gallery-lightbox-painter.js";
import { SkiaCommentPinsPainter } from "./skia-comment-pins-painter.js";
import { SkiaCollaborationOverlayPainter } from "./skia-collaboration-overlay-painter.js";
export function collectSceneImageUrls(snapshot) {
    return new Set(snapshot.elements.flatMap((element) => element.kind === "node"
        ? [
            ...(element.imageUrl ? [element.imageUrl] : []),
            ...(element.imageUrls?.slice(0, 6) ?? []),
        ]
        : element.kind === "frame" && element.imageUrl
            ? [element.imageUrl]
            : []));
}
function setsEqual(left, right) {
    return (left.size === right.size && [...left].every((value) => right.has(value)));
}
export class SkiaRenderer {
    constructor(loader = loadCanvasKit) {
        this.loader = loader;
        this.canvasKit = null;
        this.canvasElement = null;
        this.surface = null;
        this.webGpuContext = null;
        this.webGpuDeviceContext = null;
        this.webGlContext = null;
        this.resources = null;
        this.fonts = null;
        this.painter = null;
        this.exporter = null;
        this.contextMenuPainter = null;
        this.agentCursorPainter = null;
        this.measureOverlayPainter = null;
        this.imageToolbarPainter = null;
        this.variantStripPainter = null;
        this.penDrawOverlayPainter = null;
        this.penEditOverlayPainter = null;
        this.gradientOverlayPainter = null;
        this.galleryLightboxPainter = null;
        this.commentPinsPainter = null;
        this.collaborationOverlayPainter = null;
        this.backendValue = null;
        this.invalidationHandler = () => undefined;
        this.desiredImageUrls = new Set();
        this.retainedImageUrls = new Set();
        this.lifecycleVersion = 0;
    }
    get backend() {
        return this.backendValue;
    }
    setOnInvalidate(handler) {
        this.invalidationHandler = handler;
    }
    async initialize(canvas) {
        if (this.canvasKit)
            throw new Error("SkiaRenderer is already initialized");
        const initializationVersion = ++this.lifecycleVersion;
        const canvasKit = await this.loader();
        if (initializationVersion !== this.lifecycleVersion) {
            throw new Error("SkiaRenderer initialization was canceled");
        }
        this.canvasKit = canvasKit;
        this.canvasElement = canvas;
        this.resources = new SkiaResourceManager(this.canvasKit, () => this.invalidationHandler());
        this.syncImageResources();
        this.fonts = new SkiaFontManager(this.canvasKit);
        this.painter = new SkiaScenePainter(this.canvasKit, this.resources, this.fonts);
        this.exporter = new SkiaExportService(this.canvasKit, this.painter);
        this.contextMenuPainter = new SkiaContextMenuPainter(this.canvasKit, this.fonts);
        this.agentCursorPainter = new SkiaAgentCursorPainter(this.canvasKit);
        this.measureOverlayPainter = new SkiaMeasureOverlayPainter(this.canvasKit, this.fonts);
        this.imageToolbarPainter = new SkiaImageToolbarPainter(this.canvasKit, this.fonts);
        this.variantStripPainter = new SkiaVariantStripPainter(this.canvasKit, this.resources, this.fonts);
        this.penDrawOverlayPainter = new SkiaPenDrawOverlayPainter(this.canvasKit);
        this.penEditOverlayPainter = new SkiaPenEditOverlayPainter(this.canvasKit);
        this.gradientOverlayPainter = new SkiaGradientOverlayPainter(this.canvasKit);
        this.galleryLightboxPainter = new SkiaGalleryLightboxPainter(this.canvasKit, this.resources, this.fonts);
        this.commentPinsPainter = new SkiaCommentPinsPainter(this.canvasKit, this.fonts);
        this.collaborationOverlayPainter = new SkiaCollaborationOverlayPainter(this.canvasKit, this.fonts);
        this.backendValue = await this.createBackend();
        if (initializationVersion !== this.lifecycleVersion) {
            this.dispose();
            throw new Error("SkiaRenderer initialization was canceled");
        }
        return this.backendValue;
    }
    resize(width, height, devicePixelRatio) {
        const canvas = this.requireCanvasElement();
        const pixelWidth = Math.max(1, Math.round(width * devicePixelRatio));
        const pixelHeight = Math.max(1, Math.round(height * devicePixelRatio));
        if (canvas.width === pixelWidth && canvas.height === pixelHeight)
            return;
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        if (this.backendValue !== "webgpu")
            this.recreateSurface();
    }
    render(snapshot, viewport, options) {
        if (this.canvasElement) {
            const activeStates = [
                options?.contextMenu ? "context-menu" : null,
                options?.agentCursor ? "agent-cursor" : null,
                options?.measureOverlay ? "measure-overlay" : null,
                options?.imageToolbar ? "image-toolbar" : null,
                options?.videoPlaybacks?.length ? "video-playback" : null,
                options?.variantStrip ? "variant-strip" : null,
                options?.penDrawOverlay ? "pen-draw" : null,
                options?.penEditOverlay ? "pen-edit" : null,
                options?.gradientOverlay ? "gradient-edit" : null,
                options?.galleryLightbox ? "gallery-lightbox" : null,
                options?.commentPins?.pins.length ? "comment-pin" : null,
                options?.remoteCursors?.length ? "remote-cursor" : null,
            ].filter((state) => state !== null);
            this.canvasElement.dataset.skiaActiveStates = activeStates.join(" ");
        }
        const canvasKit = this.requireCanvasKit();
        const surface = this.acquireSurface();
        const canvas = surface.getCanvas();
        canvas.clear(canvasKit.parseColorString(snapshot.backgroundColor));
        canvas.save();
        canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
        canvas.translate(viewport.x, viewport.y);
        canvas.scale(viewport.zoom, viewport.zoom);
        const painter = this.requirePainter();
        painter.setCurrentContext?.(snapshot, viewport);
        painter.setVideoPlaybacks(options?.videoPlaybacks ?? []);
        painter.drawCanvasBackground(canvas, viewport, snapshot.gridMode ?? "dots", options?.pointerPos ?? null);
        drawSceneElements(canvas, snapshot.elements, painter, canvasKit.ClipOp.Intersect);
        canvas.restore();
        if (options?.measureOverlay) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.measureOverlayPainter?.draw(canvas, options.measureOverlay, viewport);
            canvas.restore();
        }
        if (options?.agentCursor) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.agentCursorPainter?.draw(canvas, options.agentCursor, viewport, performance.now());
            canvas.restore();
        }
        if (options?.imageToolbar) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.imageToolbarPainter?.draw(canvas, options.imageToolbar, viewport);
            canvas.restore();
        }
        if (options?.variantStrip) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.variantStripPainter?.draw(canvas, options.variantStrip, viewport);
            canvas.restore();
        }
        if (options?.penDrawOverlay) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.penDrawOverlayPainter?.draw(canvas, options.penDrawOverlay, viewport);
            canvas.restore();
        }
        if (options?.penEditOverlay) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.penEditOverlayPainter?.draw(canvas, options.penEditOverlay, viewport);
            canvas.restore();
        }
        if (options?.gradientOverlay) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.gradientOverlayPainter?.draw(canvas, options.gradientOverlay, viewport);
            canvas.restore();
        }
        if (options?.peerSelections?.length) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.collaborationOverlayPainter?.drawSelections(canvas, options.peerSelections, viewport);
            canvas.restore();
        }
        if (options?.remoteCursors?.length) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.collaborationOverlayPainter?.drawCursors(canvas, options.remoteCursors, viewport, performance.now());
            canvas.restore();
        }
        if (options?.commentPins) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.commentPinsPainter?.draw(canvas, options.commentPins, viewport);
            canvas.restore();
        }
        // Modal media must be painted after collaboration chrome so canvas
        // annotations cannot leak through the lightbox backdrop.
        if (options?.galleryLightbox) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.galleryLightboxPainter?.draw(canvas, options.galleryLightbox, viewport, options.videoPlaybacks?.find((playback) => playback.id === options.galleryLightbox?.videoPlaybackId) ?? null);
            canvas.restore();
        }
        if (options?.contextMenu) {
            canvas.save();
            canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
            this.contextMenuPainter?.draw(canvas, options.contextMenu, viewport);
            canvas.restore();
        }
        surface.flush();
        if (this.backendValue === "webgpu")
            surface.delete();
    }
    registerFont(family, bytes) {
        this.requireFonts().registerFont(family, bytes);
        this.invalidationHandler();
    }
    loadFont(family, url) {
        return this.requireFonts()
            .loadFont(family, url)
            .then(() => this.invalidationHandler());
    }
    preloadImage(url) {
        return this.requireResources().preloadImage(url);
    }
    updateVideoFrame(id, source) {
        this.requireResources().updateVideoFrame(id, source);
    }
    releaseVideoFrame(id) {
        this.resources?.releaseVideoFrame(id);
    }
    updateResources(snapshot) {
        const nextImageUrls = collectSceneImageUrls(snapshot);
        if (setsEqual(this.desiredImageUrls, nextImageUrls))
            return;
        this.desiredImageUrls = nextImageUrls;
        this.syncImageResources();
    }
    async waitForResources(snapshot, timeoutMs) {
        const imageUrls = [...collectSceneImageUrls(snapshot)];
        await Promise.all([
            this.requireResources().waitForImages(imageUrls, timeoutMs),
            this.requireFonts().waitForPending(),
        ]);
    }
    async exportSnapshot(snapshot, options) {
        await this.waitForResources(snapshot, options.timeoutMs ?? 15000);
        if (!this.exporter)
            throw new Error("Skia export service is unavailable");
        return this.exporter.export(snapshot, options);
    }
    inspectTextLayouts(elements, scopeIds) {
        return inspectSceneTextLayouts(elements, this.requireFonts(), scopeIds);
    }
    dispose() {
        this.lifecycleVersion += 1;
        this.measureOverlayPainter?.dispose();
        this.imageToolbarPainter?.dispose();
        this.variantStripPainter?.dispose();
        this.penDrawOverlayPainter?.dispose();
        this.penEditOverlayPainter?.dispose();
        this.gradientOverlayPainter?.dispose();
        this.galleryLightboxPainter?.dispose();
        this.commentPinsPainter?.dispose();
        this.collaborationOverlayPainter?.dispose();
        this.agentCursorPainter?.dispose();
        this.contextMenuPainter?.dispose();
        this.painter?.dispose();
        this.resources?.dispose();
        this.fonts?.dispose();
        this.surface?.delete();
        this.webGlContext?.delete();
        this.webGpuDeviceContext?.delete();
        this.painter = null;
        this.contextMenuPainter = null;
        this.agentCursorPainter = null;
        this.measureOverlayPainter = null;
        this.imageToolbarPainter = null;
        this.variantStripPainter = null;
        this.penDrawOverlayPainter = null;
        this.penEditOverlayPainter = null;
        this.gradientOverlayPainter = null;
        this.galleryLightboxPainter = null;
        this.commentPinsPainter = null;
        this.collaborationOverlayPainter = null;
        this.exporter = null;
        this.resources = null;
        this.fonts = null;
        this.surface = null;
        this.webGlContext = null;
        this.webGpuContext = null;
        this.webGpuDeviceContext = null;
        this.canvasElement = null;
        this.canvasKit = null;
        this.backendValue = null;
        this.desiredImageUrls.clear();
        this.retainedImageUrls.clear();
    }
    async createBackend() {
        const canvasKit = this.requireCanvasKit();
        const canvas = this.requireCanvasElement();
        const gpu = navigator.gpu;
        // CanvasKit's WebGPU helpers are only shipped by WebGPU-enabled builds.
        // A browser may expose navigator.gpu while the loaded CanvasKit build does
        // not, so capability-check both sides before entering this backend.
        if (gpu &&
            typeof canvasKit.MakeGPUDeviceContext === "function" &&
            typeof canvasKit.MakeGPUCanvasContext === "function") {
            const adapter = await gpu.requestAdapter();
            if (adapter) {
                const deviceContext = canvasKit.MakeGPUDeviceContext(await adapter.requestDevice());
                if (deviceContext) {
                    const canvasContext = canvasKit.MakeGPUCanvasContext(deviceContext, canvas);
                    if (canvasContext) {
                        this.webGpuDeviceContext = deviceContext;
                        this.webGpuContext = canvasContext;
                        return "webgpu";
                    }
                    deviceContext.delete();
                }
            }
        }
        if (this.createWebGlSurface(canvasKit, canvas))
            return "webgl";
        this.surface = canvasKit.MakeSWCanvasSurface(canvas);
        if (!this.surface) {
            throw new Error("CanvasKit could not create a rendering surface");
        }
        return "software";
    }
    createWebGlSurface(canvasKit, canvas) {
        const handle = canvasKit.GetWebGLContext(canvas, {
            alpha: 1,
            antialias: 0,
        });
        if (!handle)
            return false;
        const context = canvasKit.MakeWebGLContext(handle);
        if (!context)
            return false;
        const surface = canvasKit.MakeOnScreenGLSurface(context, Math.max(1, canvas.width), Math.max(1, canvas.height), canvasKit.ColorSpace.SRGB);
        if (!surface) {
            context.delete();
            return false;
        }
        this.webGlContext = context;
        this.surface = surface;
        return true;
    }
    recreateSurface() {
        this.surface?.delete();
        this.surface = null;
        const canvasKit = this.requireCanvasKit();
        const canvas = this.requireCanvasElement();
        this.surface =
            this.backendValue === "webgl" && this.webGlContext
                ? canvasKit.MakeOnScreenGLSurface(this.webGlContext, canvas.width, canvas.height, canvasKit.ColorSpace.SRGB)
                : canvasKit.MakeSWCanvasSurface(canvas);
        if (!this.surface)
            throw new Error("CanvasKit surface resize failed");
    }
    acquireSurface() {
        if (this.backendValue === "webgpu") {
            const canvasKit = this.requireCanvasKit();
            const canvas = this.requireCanvasElement();
            if (!this.webGpuContext) {
                throw new Error("WebGPU canvas context is unavailable");
            }
            const surface = canvasKit.MakeGPUCanvasSurface(this.webGpuContext, canvasKit.ColorSpace.SRGB, canvas.width, canvas.height);
            if (!surface) {
                throw new Error("CanvasKit WebGPU surface creation failed");
            }
            return surface;
        }
        if (!this.surface)
            throw new Error("SkiaRenderer surface is unavailable");
        return this.surface;
    }
    requireCanvasKit() {
        if (!this.canvasKit)
            throw new Error("SkiaRenderer is not initialized");
        return this.canvasKit;
    }
    syncImageResources() {
        if (!this.resources)
            return;
        for (const url of this.retainedImageUrls) {
            if (!this.desiredImageUrls.has(url))
                this.resources.releaseImage(url);
        }
        for (const url of this.desiredImageUrls) {
            if (!this.retainedImageUrls.has(url)) {
                void this.resources.preloadImage(url).catch(() => undefined);
            }
        }
        this.retainedImageUrls = new Set(this.desiredImageUrls);
    }
    requireCanvasElement() {
        if (!this.canvasElement) {
            throw new Error("SkiaRenderer canvas is unavailable");
        }
        return this.canvasElement;
    }
    requireResources() {
        if (!this.resources) {
            throw new Error("Skia resource manager is unavailable");
        }
        return this.resources;
    }
    requireFonts() {
        if (!this.fonts)
            throw new Error("Skia font manager is unavailable");
        return this.fonts;
    }
    requirePainter() {
        if (!this.painter)
            throw new Error("Skia scene painter is unavailable");
        return this.painter;
    }
}
//# sourceMappingURL=skia-renderer.js.map