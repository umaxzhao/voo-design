import { layoutSkiaGalleryLightbox, } from "./skia-gallery-lightbox.js";
import { SkiaVideoPainter } from "./skia-video-painter.js";
export class SkiaGalleryLightboxPainter {
    constructor(canvasKit, resources, fonts) {
        this.canvasKit = canvasKit;
        this.resources = resources;
        this.fonts = fonts;
        this.fillPaint = new canvasKit.Paint();
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(canvasKit.PaintStyle.Fill);
        this.videoPainter = new SkiaVideoPainter(canvasKit, resources);
    }
    draw(canvas, lightbox, viewport, videoPlayback = null) {
        const layout = layoutSkiaGalleryLightbox(viewport);
        this.fillPaint.setColor(this.canvasKit.parseColorString("#111111E8"));
        canvas.drawRect([0, 0, viewport.width, viewport.height], this.fillPaint);
        this.fillPaint.setColor(this.canvasKit.parseColorString("#18181B"));
        canvas.drawRRect(this.canvasKit.RRectXY([
            layout.image.left,
            layout.image.top,
            layout.image.left + layout.image.width,
            layout.image.top + layout.image.height,
        ], 12, 12), this.fillPaint);
        const image = lightbox.mediaType === "image"
            ? this.resources.getImage(lightbox.url)
            : null;
        if (image) {
            const scale = Math.min(layout.image.width / image.width(), layout.image.height / image.height());
            const width = image.width() * scale;
            const height = image.height() * scale;
            const left = layout.image.left + (layout.image.width - width) / 2;
            const top = layout.image.top + (layout.image.height - height) / 2;
            canvas.drawImageRect(image, [0, 0, image.width(), image.height()], [left, top, left + width, top + height], this.fillPaint, false);
        }
        else if (lightbox.mediaType === "video" && videoPlayback) {
            this.videoPainter.drawLightbox(canvas, viewport, videoPlayback);
        }
        this.drawButton(canvas, "Download", layout.download, lightbox.highlightedAction === "download");
        this.drawButton(canvas, "Close", layout.close, lightbox.highlightedAction === "close");
    }
    dispose() {
        this.videoPainter.dispose();
        this.fillPaint.delete();
    }
    drawButton(canvas, label, bounds, highlighted) {
        this.fillPaint.setColor(this.canvasKit.parseColorString(highlighted ? "#FFFFFF33" : "#FFFFFF1A"));
        canvas.drawRRect(this.canvasKit.RRectXY([
            bounds.left,
            bounds.top,
            bounds.left + bounds.width,
            bounds.top + bounds.height,
        ], 8, 8), this.fillPaint);
        const paragraph = this.fonts.createParagraph({
            text: label,
            color: "#FFFFFF",
            fontFamily: "Inter",
            fontSize: 11,
            lineHeight: 16,
            fontWeight: 600,
            letterSpacing: 0,
            align: "center",
            direction: "ltr",
            maxLines: 1,
        }, bounds.width);
        if (!paragraph)
            return;
        try {
            canvas.drawParagraph(paragraph, bounds.left, bounds.top + 8);
        }
        finally {
            paragraph.delete();
        }
    }
}
//# sourceMappingURL=skia-gallery-lightbox-painter.js.map