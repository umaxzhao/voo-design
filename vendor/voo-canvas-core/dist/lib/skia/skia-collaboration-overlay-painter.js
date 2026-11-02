import { remoteCursorOpacity } from "./skia-collaboration-overlay.js";
const CURSOR_PATH = "M2 2 L2 16 L6 12 L9 18 L11 17 L8 11 L14 11 Z";
export class SkiaCollaborationOverlayPainter {
    constructor(canvasKit, fonts) {
        this.canvasKit = canvasKit;
        this.fonts = fonts;
        const cursorPath = canvasKit.Path.MakeFromSVGString(CURSOR_PATH);
        if (!cursorPath)
            throw new Error("Unable to create remote cursor path");
        this.cursorPath = cursorPath;
        this.fillPaint = new canvasKit.Paint();
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(canvasKit.PaintStyle.Fill);
        this.strokePaint = new canvasKit.Paint();
        this.strokePaint.setAntiAlias(true);
        this.strokePaint.setStyle(canvasKit.PaintStyle.Stroke);
        this.strokePaint.setStrokeWidth(2);
    }
    drawSelections(canvas, selections, viewport) {
        selections.forEach((selection) => {
            const offset = 4 + selection.stackIndex * 4;
            const left = viewport.x + selection.x * viewport.zoom - offset;
            const top = viewport.y + selection.y * viewport.zoom - offset;
            const width = selection.width * viewport.zoom + offset * 2;
            const height = selection.height * viewport.zoom + offset * 2;
            this.strokePaint.setColor(this.canvasKit.parseColorString(selection.color));
            canvas.save();
            if (selection.rotation) {
                canvas.rotate(selection.rotation, left + width / 2, top + height / 2);
            }
            if (selection.stackIndex === 0) {
                this.strokePaint.setAlphaf(0.1);
                this.strokePaint.setStrokeWidth(8);
                canvas.drawRRect(this.canvasKit.RRectXY([left, top, left + width, top + height], 4, 4), this.strokePaint);
            }
            this.strokePaint.setAlphaf(1);
            this.strokePaint.setStrokeWidth(2);
            canvas.drawRRect(this.canvasKit.RRectXY([left, top, left + width, top + height], 4, 4), this.strokePaint);
            canvas.restore();
            if (selection.showLabel) {
                this.drawLabel(canvas, selection.peerName, left, top - 20, selection.color);
            }
        });
    }
    drawCursors(canvas, cursors, viewport, timestampMs) {
        cursors.forEach((cursor) => {
            const opacity = remoteCursorOpacity(cursor.leavingAt, timestampMs);
            if (opacity <= 0)
                return;
            const x = viewport.x + cursor.x * viewport.zoom;
            const y = viewport.y + cursor.y * viewport.zoom;
            this.fillPaint.setColor(this.canvasKit.parseColorString(cursor.color));
            this.fillPaint.setAlphaf(opacity);
            this.strokePaint.setColor(this.canvasKit.parseColorString("#FFFFFF"));
            this.strokePaint.setStrokeWidth(1);
            this.strokePaint.setAlphaf(opacity);
            canvas.save();
            canvas.translate(x, y);
            canvas.drawPath(this.cursorPath, this.fillPaint);
            canvas.drawPath(this.cursorPath, this.strokePaint);
            canvas.restore();
            this.drawLabel(canvas, cursor.label, x + 18, y + 14, cursor.color, opacity);
        });
        this.fillPaint.setAlphaf(1);
        this.strokePaint.setAlphaf(1);
    }
    dispose() {
        this.cursorPath.delete();
        this.fillPaint.delete();
        this.strokePaint.delete();
    }
    drawLabel(canvas, text, x, y, color, opacity = 1) {
        const width = Math.max(48, Math.min(180, text.length * 7 + 16));
        this.fillPaint.setColor(this.canvasKit.parseColorString(color));
        this.fillPaint.setAlphaf(opacity);
        canvas.drawRRect(this.canvasKit.RRectXY([x, y, x + width, y + 20], 5, 5), this.fillPaint);
        const paragraph = this.fonts.createParagraph({
            text,
            color: `rgba(255, 255, 255, ${opacity})`,
            fontFamily: "Inter",
            fontSize: 10,
            lineHeight: 14,
            fontWeight: 500,
            letterSpacing: 0,
            align: "left",
            direction: "ltr",
            maxLines: 1,
            ellipsis: "…",
        }, width - 12);
        if (!paragraph)
            return;
        try {
            canvas.drawParagraph(paragraph, x + 6, y + 3);
        }
        finally {
            paragraph.delete();
        }
    }
}
//# sourceMappingURL=skia-collaboration-overlay-painter.js.map