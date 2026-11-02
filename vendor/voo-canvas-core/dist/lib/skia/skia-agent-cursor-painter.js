const CURSOR_PATH = "M2.5 1.75 17.25 13.1l-7.08 1.35-3.3 7.45L2.5 1.75Z";
const ACCENT_COLOR = "#A640FF";
export class SkiaAgentCursorPainter {
    constructor(canvasKit) {
        this.canvasKit = canvasKit;
        const cursorPath = canvasKit.Path.MakeFromSVGString(CURSOR_PATH);
        if (!cursorPath)
            throw new Error("Unable to create the Skia agent cursor path");
        this.cursorPath = cursorPath;
        this.fillPaint = new canvasKit.Paint();
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(canvasKit.PaintStyle.Fill);
        this.fillPaint.setColor(canvasKit.parseColorString(ACCENT_COLOR));
        this.strokePaint = new canvasKit.Paint();
        this.strokePaint.setAntiAlias(true);
        this.strokePaint.setStyle(canvasKit.PaintStyle.Stroke);
        this.strokePaint.setStrokeWidth(2);
        this.strokePaint.setStrokeJoin(canvasKit.StrokeJoin.Round);
        this.strokePaint.setColor(canvasKit.parseColorString("#FFFFFF"));
        this.pulsePaint = new canvasKit.Paint();
        this.pulsePaint.setAntiAlias(true);
        this.pulsePaint.setStyle(canvasKit.PaintStyle.Stroke);
        this.pulsePaint.setStrokeWidth(1);
        this.pulsePaint.setColor(canvasKit.parseColorString(ACCENT_COLOR));
    }
    draw(canvas, cursor, viewport, timestampMs) {
        if (!cursor.visible)
            return;
        const screenX = viewport.x + cursor.x * viewport.zoom;
        const screenY = viewport.y + cursor.y * viewport.zoom;
        if (!cursor.reducedMotion) {
            const phase = (timestampMs % 800) / 800;
            this.pulsePaint.setAlphaf(1 - phase);
            canvas.drawCircle(screenX, screenY, 8 + phase * 10, this.pulsePaint);
        }
        canvas.save();
        canvas.translate(screenX - 10, screenY - 12);
        canvas.drawPath(this.cursorPath, this.fillPaint);
        canvas.drawPath(this.cursorPath, this.strokePaint);
        canvas.restore();
    }
    dispose() {
        this.cursorPath.delete();
        this.fillPaint.delete();
        this.strokePaint.delete();
        this.pulsePaint.delete();
    }
}
//# sourceMappingURL=skia-agent-cursor-painter.js.map