import { layoutSkiaVariantStrip, } from "./skia-variant-strip.js";
export class SkiaVariantStripPainter {
    constructor(canvasKit, resources, fonts) {
        this.canvasKit = canvasKit;
        this.resources = resources;
        this.fonts = fonts;
        this.fillPaint = new canvasKit.Paint();
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(canvasKit.PaintStyle.Fill);
        this.strokePaint = new canvasKit.Paint();
        this.strokePaint.setAntiAlias(true);
        this.strokePaint.setStyle(canvasKit.PaintStyle.Stroke);
        this.strokePaint.setStrokeWidth(2);
    }
    draw(canvas, strip, viewport) {
        const layout = layoutSkiaVariantStrip(strip, viewport);
        this.drawText(canvas, `OUT ${strip.urls.length}`, layout.left, layout.top + 16, 40, 10);
        for (const thumb of layout.thumbs) {
            const url = strip.urls[thumb.index];
            this.fillPaint.setColor(this.canvasKit.parseColorString("#E4E4E7"));
            canvas.drawRRect(this.canvasKit.RRectXY([
                thumb.left,
                thumb.top,
                thumb.left + thumb.size,
                thumb.top + thumb.size,
            ], 6, 6), this.fillPaint);
            const image = strip.mediaType === "image" && url
                ? this.resources.getImage(url)
                : null;
            if (image) {
                canvas.save();
                canvas.clipRRect(this.canvasKit.RRectXY([
                    thumb.left,
                    thumb.top,
                    thumb.left + thumb.size,
                    thumb.top + thumb.size,
                ], 6, 6), this.canvasKit.ClipOp.Intersect, true);
                canvas.drawImageRect(image, [0, 0, image.width(), image.height()], [
                    thumb.left,
                    thumb.top,
                    thumb.left + thumb.size,
                    thumb.top + thumb.size,
                ], this.fillPaint, false);
                canvas.restore();
            }
            else if (strip.mediaType === "video") {
                this.drawText(canvas, "PLAY", thumb.left + 4, thumb.top + 18, 40, 9);
            }
            this.strokePaint.setColor(this.canvasKit.parseColorString(url === strip.activeUrl ? "#A640FF" : "#D4D4D8"));
            canvas.drawRRect(this.canvasKit.RRectXY([
                thumb.left + 1,
                thumb.top + 1,
                thumb.left + thumb.size - 1,
                thumb.top + thumb.size - 1,
            ], 6, 6), this.strokePaint);
            if (strip.hover?.index === thumb.index) {
                this.drawText(canvas, "X", thumb.left + 2, thumb.top + 1, 14, 9, "#E11D48");
                this.drawText(canvas, "+", thumb.left + 32, thumb.top + 1, 14, 11);
            }
            this.drawText(canvas, String(thumb.index + 1), thumb.left + 3, thumb.top + 34, 14, 9, "#FFFFFF");
        }
    }
    dispose() {
        this.fillPaint.delete();
        this.strokePaint.delete();
    }
    drawText(canvas, text, x, y, width, fontSize, color = "#52525B") {
        const paragraph = this.fonts.createParagraph({
            text,
            color,
            fontFamily: "Inter",
            fontSize,
            lineHeight: fontSize + 3,
            fontWeight: 700,
            letterSpacing: 0,
            align: "center",
            direction: "ltr",
            maxLines: 1,
        }, width);
        if (!paragraph)
            return;
        try {
            canvas.drawParagraph(paragraph, x, y);
        }
        finally {
            paragraph.delete();
        }
    }
}
//# sourceMappingURL=skia-variant-strip-painter.js.map