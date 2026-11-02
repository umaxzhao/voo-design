export class SkiaCommentPinsPainter {
    constructor(canvasKit, fonts) {
        this.canvasKit = canvasKit;
        this.fonts = fonts;
        this.fillPaint = new canvasKit.Paint();
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(canvasKit.PaintStyle.Fill);
        this.strokePaint = new canvasKit.Paint();
        this.strokePaint.setAntiAlias(true);
        this.strokePaint.setStyle(canvasKit.PaintStyle.Stroke);
        this.strokePaint.setStrokeWidth(2);
        this.strokePaint.setColor(canvasKit.parseColorString("#FFFFFF"));
    }
    draw(canvas, state, viewport) {
        state.pins.forEach((pin) => {
            const x = viewport.x + pin.x * viewport.zoom;
            const y = viewport.y + pin.y * viewport.zoom;
            const radius = state.hoveredId === pin.id ? 13 : 11;
            this.fillPaint.setColor(this.canvasKit.parseColorString(pin.draft ? "#86EFAC" : "#22C55E"));
            canvas.drawCircle(x, y, radius, this.fillPaint);
            canvas.drawCircle(x, y, radius, this.strokePaint);
            const paragraph = this.fonts.createParagraph({
                text: pin.label,
                color: "#111827",
                fontFamily: "Inter",
                fontSize: 10,
                lineHeight: 14,
                fontWeight: 700,
                letterSpacing: 0,
                align: "center",
                direction: "ltr",
                maxLines: 1,
            }, 22);
            if (!paragraph)
                return;
            try {
                canvas.drawParagraph(paragraph, x - 11, y - 7);
            }
            finally {
                paragraph.delete();
            }
        });
    }
    dispose() {
        this.fillPaint.delete();
        this.strokePaint.delete();
    }
}
//# sourceMappingURL=skia-comment-pins-painter.js.map