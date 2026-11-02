const ACCENT = "#3B82F6";
export class SkiaPenDrawOverlayPainter {
    constructor(canvasKit) {
        this.canvasKit = canvasKit;
        this.fillPaint = new canvasKit.Paint();
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(canvasKit.PaintStyle.Fill);
        this.fillPaint.setColor(canvasKit.parseColorString("#FFFFFF"));
        this.strokePaint = new canvasKit.Paint();
        this.strokePaint.setAntiAlias(true);
        this.strokePaint.setStyle(canvasKit.PaintStyle.Stroke);
        this.strokePaint.setStrokeWidth(1);
        this.strokePaint.setColor(canvasKit.parseColorString(ACCENT));
    }
    draw(canvas, overlay, viewport) {
        const toScreen = (point) => ({
            x: viewport.x + point.x * viewport.zoom,
            y: viewport.y + point.y * viewport.zoom,
        });
        overlay.anchors.forEach((anchor, index) => {
            const point = toScreen(anchor);
            const isLatest = index === overlay.anchors.length - 1;
            const handles = isLatest && !overlay.isSubPathTerminated
                ? [anchor.handleIn, anchor.handleOut].filter((handle) => Boolean(handle))
                : [];
            handles.forEach((handle) => {
                const screenHandle = toScreen(handle);
                const pathBuilder = new this.canvasKit.PathBuilder();
                const path = pathBuilder
                    .moveTo(point.x, point.y)
                    .lineTo(screenHandle.x, screenHandle.y)
                    .detach();
                canvas.drawPath(path, this.strokePaint);
                path.delete();
                pathBuilder.delete();
                canvas.drawCircle(screenHandle.x, screenHandle.y, 4, this.fillPaint);
                canvas.drawCircle(screenHandle.x, screenHandle.y, 4, this.strokePaint);
            });
            canvas.drawRect([point.x - 5, point.y - 5, point.x + 5, point.y + 5], this.fillPaint);
            canvas.drawRect([point.x - 5, point.y - 5, point.x + 5, point.y + 5], this.strokePaint);
        });
    }
    dispose() {
        this.fillPaint.delete();
        this.strokePaint.delete();
    }
}
//# sourceMappingURL=skia-pen-draw-overlay-painter.js.map