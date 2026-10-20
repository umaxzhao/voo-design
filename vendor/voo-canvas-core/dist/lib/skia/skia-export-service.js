import { createRasterPdf } from "./raster-pdf.js";
import { drawSceneElements } from "./skia-scene-draw.js";
const MAX_EXPORT_DIMENSION = 32767;
export class SkiaExportService {
    constructor(canvasKit, painter) {
        this.canvasKit = canvasKit;
        this.painter = painter;
    }
    export(snapshot, options) {
        const scale = options.scale ?? 1;
        if (!Number.isFinite(scale) || scale <= 0) {
            throw new Error("Skia export scale must be positive");
        }
        const width = Math.max(1, Math.round(options.bounds.width * scale));
        const height = Math.max(1, Math.round(options.bounds.height * scale));
        if (width > MAX_EXPORT_DIMENSION || height > MAX_EXPORT_DIMENSION) {
            throw new Error(`Skia export exceeds ${MAX_EXPORT_DIMENSION}px surface limit`);
        }
        const imageFormat = options.format === "pdf"
            ? this.canvasKit.ImageFormat.JPEG
            : this.resolveImageFormat(options.format);
        const raster = this.renderRaster(snapshot, options, width, height, scale, imageFormat);
        return options.format === "pdf"
            ? createRasterPdf(raster, width, height, options.bounds.width, options.bounds.height)
            : raster;
    }
    renderRaster(snapshot, options, width, height, scale, format) {
        const surface = this.canvasKit.MakeSurface(width, height);
        if (!surface)
            throw new Error("CanvasKit could not create export surface");
        try {
            const canvas = surface.getCanvas();
            const background = options.backgroundColor ??
                (options.format === "jpeg" || options.format === "pdf"
                    ? "#FFFFFF"
                    : snapshot.backgroundColor);
            canvas.clear(this.canvasKit.parseColorString(background));
            canvas.save();
            canvas.scale(scale, scale);
            canvas.translate(-options.bounds.x, -options.bounds.y);
            drawSceneElements(canvas, snapshot.elements, this.painter, this.canvasKit.ClipOp.Intersect);
            canvas.restore();
            surface.flush();
            const image = surface.makeImageSnapshot();
            try {
                const encoded = image.encodeToBytes(format, options.quality ?? 92);
                if (!encoded)
                    throw new Error("CanvasKit image encoding failed");
                return encoded;
            }
            finally {
                image.delete();
            }
        }
        finally {
            surface.delete();
        }
    }
    resolveImageFormat(format) {
        if (format === "jpeg")
            return this.canvasKit.ImageFormat.JPEG;
        if (format === "webp")
            return this.canvasKit.ImageFormat.WEBP;
        return this.canvasKit.ImageFormat.PNG;
    }
}
//# sourceMappingURL=skia-export-service.js.map