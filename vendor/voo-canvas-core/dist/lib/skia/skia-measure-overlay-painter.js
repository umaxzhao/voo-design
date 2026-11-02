import { buildSkiaMeasureSegments, } from "./skia-measure-overlay.js";
const MEASURE_COLOR = "#FF3B30";
export class SkiaMeasureOverlayPainter {
    constructor(canvasKit, fonts) {
        this.canvasKit = canvasKit;
        this.fonts = fonts;
        this.paint = new canvasKit.Paint();
        this.paint.setAntiAlias(true);
        this.paint.setStyle(canvasKit.PaintStyle.Fill);
        this.paint.setColor(canvasKit.parseColorString(MEASURE_COLOR));
    }
    draw(canvas, overlay, viewport) {
        for (const segment of buildSkiaMeasureSegments(overlay, viewport)) {
            canvas.drawRect(segment.horizontal
                ? [
                    segment.left,
                    segment.top,
                    segment.left + segment.length,
                    segment.top + 1,
                ]
                : [
                    segment.left,
                    segment.top,
                    segment.left + 1,
                    segment.top + segment.length,
                ], this.paint);
            this.drawLabel(canvas, segment);
        }
    }
    dispose() {
        this.paint.delete();
    }
    drawLabel(canvas, segment) {
        const text = String(Math.round(segment.value));
        const width = Math.max(20, text.length * 7 + 8);
        const centerX = segment.horizontal
            ? segment.left + segment.length / 2
            : segment.left + 10;
        const centerY = segment.horizontal
            ? segment.top - 10
            : segment.top + segment.length / 2;
        canvas.drawRRect(this.canvasKit.RRectXY([centerX - width / 2, centerY - 7, centerX + width / 2, centerY + 7], 3, 3), this.paint);
        const paragraph = this.fonts.createParagraph({
            text,
            color: "#FFFFFF",
            fontFamily: "Inter",
            fontSize: 10,
            lineHeight: 14,
            fontWeight: 600,
            letterSpacing: 0,
            align: "center",
            direction: "ltr",
            maxLines: 1,
        }, width);
        if (!paragraph)
            return;
        try {
            canvas.drawParagraph(paragraph, centerX - width / 2, centerY - 7);
        }
        finally {
            paragraph.delete();
        }
    }
}
//# sourceMappingURL=skia-measure-overlay-painter.js.map