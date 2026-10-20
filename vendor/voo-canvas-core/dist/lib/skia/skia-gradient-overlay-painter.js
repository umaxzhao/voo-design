const ACCENT = "#3B82F6";
export class SkiaGradientOverlayPainter {
    constructor(canvasKit) {
        this.canvasKit = canvasKit;
        this.fillPaint = new canvasKit.Paint();
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(canvasKit.PaintStyle.Fill);
        this.fillPaint.setColor(canvasKit.parseColorString("#FFFFFF"));
        this.strokePaint = new canvasKit.Paint();
        this.strokePaint.setAntiAlias(true);
        this.strokePaint.setStyle(canvasKit.PaintStyle.Stroke);
        this.strokePaint.setStrokeWidth(1.5);
        this.strokePaint.setColor(canvasKit.parseColorString(ACCENT));
    }
    draw(canvas, overlay, viewport) {
        const start = this.toScreen(overlay.start, viewport);
        const end = this.toScreen(overlay.end, viewport);
        const builder = new this.canvasKit.PathBuilder();
        const path = builder.moveTo(start.x, start.y).lineTo(end.x, end.y).detach();
        canvas.drawPath(path, this.strokePaint);
        path.delete();
        builder.delete();
        this.drawHandle(canvas, start, overlay.activeHandle === "start" || overlay.hoveredHandle === "start");
        this.drawHandle(canvas, end, overlay.activeHandle === "end" || overlay.hoveredHandle === "end");
    }
    dispose() {
        this.fillPaint.delete();
        this.strokePaint.delete();
    }
    toScreen(point, viewport) {
        return {
            x: viewport.x + point.x * viewport.zoom,
            y: viewport.y + point.y * viewport.zoom,
        };
    }
    drawHandle(canvas, point, active) {
        canvas.drawCircle(point.x, point.y, active ? 7 : 6, this.fillPaint);
        canvas.drawCircle(point.x, point.y, active ? 7 : 6, this.strokePaint);
    }
}
//# sourceMappingURL=skia-gradient-overlay-painter.js.map