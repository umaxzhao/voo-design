const ACCENT = "#3B82F6";
const WHITE = "#FFFFFF";
export class SkiaPenEditOverlayPainter {
    constructor(canvasKit) {
        this.canvasKit = canvasKit;
        this.fillPaint = new canvasKit.Paint();
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(canvasKit.PaintStyle.Fill);
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
        overlay.anchors.forEach((anchor) => {
            const point = toScreen(anchor);
            if (anchor.handlesVisible) {
                if (anchor.handleIn) {
                    this.drawHandle(canvas, point, toScreen(anchor.handleIn));
                }
                if (anchor.handleOut) {
                    this.drawHandle(canvas, point, toScreen(anchor.handleOut));
                }
            }
            const halfSize = anchor.endpoint ? 6 : 5;
            if (anchor.selected) {
                this.fillPaint.setColor(this.canvasKit.parseColorString(ACCENT));
                this.fillPaint.setAlphaf(0.2);
                canvas.drawRect([
                    point.x - halfSize - 3,
                    point.y - halfSize - 3,
                    point.x + halfSize + 3,
                    point.y + halfSize + 3,
                ], this.fillPaint);
            }
            this.fillPaint.setAlphaf(1);
            this.fillPaint.setColor(this.canvasKit.parseColorString(anchor.selected ? ACCENT : WHITE));
            canvas.drawRect([
                point.x - halfSize,
                point.y - halfSize,
                point.x + halfSize,
                point.y + halfSize,
            ], this.fillPaint);
            canvas.drawRect([
                point.x - halfSize,
                point.y - halfSize,
                point.x + halfSize,
                point.y + halfSize,
            ], this.strokePaint);
        });
        if (overlay.insertPreview) {
            const point = toScreen(overlay.insertPreview);
            this.fillPaint.setColor(this.canvasKit.parseColorString(WHITE));
            canvas.drawCircle(point.x, point.y, 6, this.fillPaint);
            canvas.drawCircle(point.x, point.y, 6, this.strokePaint);
            this.drawLine(canvas, { x: point.x - 4, y: point.y }, { x: point.x + 4, y: point.y });
            this.drawLine(canvas, { x: point.x, y: point.y - 4 }, { x: point.x, y: point.y + 4 });
        }
    }
    dispose() {
        this.fillPaint.delete();
        this.strokePaint.delete();
    }
    drawHandle(canvas, anchor, handle) {
        this.drawLine(canvas, anchor, handle);
        this.fillPaint.setColor(this.canvasKit.parseColorString(WHITE));
        canvas.drawCircle(handle.x, handle.y, 4, this.fillPaint);
        canvas.drawCircle(handle.x, handle.y, 4, this.strokePaint);
    }
    drawLine(canvas, start, end) {
        const builder = new this.canvasKit.PathBuilder();
        const path = builder.moveTo(start.x, start.y).lineTo(end.x, end.y).detach();
        canvas.drawPath(path, this.strokePaint);
        path.delete();
        builder.delete();
    }
}
//# sourceMappingURL=skia-pen-edit-overlay-painter.js.map