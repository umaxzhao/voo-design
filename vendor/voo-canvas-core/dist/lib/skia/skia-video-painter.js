import { calculateImageLayout } from "./image-layout.js";
import { layoutSkiaVideoLightboxControls, layoutSkiaVideoNodeControls, } from "./skia-video-playback.js";
const BACKGROUND = "#18181B";
const FOREGROUND = "#FFFFFF";
const EMPTY_BACKGROUND = "#E5E7EB";
const EMPTY_FOREGROUND = "#9CA3AF";
const ACCENT = "#3B82F6";
export class SkiaVideoPainter {
    constructor(canvasKit, resources) {
        this.canvasKit = canvasKit;
        this.resources = resources;
        this.fillPaint = new canvasKit.Paint();
        this.strokePaint = new canvasKit.Paint();
    }
    configurePaints() {
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(this.canvasKit.PaintStyle.Fill);
        this.strokePaint.setAntiAlias(true);
        this.strokePaint.setStyle(this.canvasKit.PaintStyle.Stroke);
        this.strokePaint.setStrokeWidth(2);
    }
    drawNode(canvas, node, playback) {
        this.configurePaints();
        const layout = layoutSkiaVideoNodeControls(node);
        const { content } = layout;
        const radius = node.shape === "card" ? 12 : (node.cornerRadius ?? 0);
        const rect = [
            content.left,
            content.top,
            content.left + content.width,
            content.top + content.height,
        ];
        this.fillPaint.setAlphaf(playback ? node.opacity : node.opacity * 0.72);
        this.fillPaint.setColor(this.canvasKit.parseColorString(playback ? BACKGROUND : EMPTY_BACKGROUND));
        canvas.drawRRect(this.canvasKit.RRectXY(rect, Math.max(0, radius), Math.max(0, radius)), this.fillPaint);
        const frame = playback ? this.resources.getVideoFrame(playback.id) : null;
        if (frame) {
            const imageLayout = calculateImageLayout(frame.width(), frame.height(), content.width, content.height, node.videoFit ?? "cover", "center");
            canvas.save();
            canvas.clipRRect(this.canvasKit.RRectXY(rect, Math.max(0, radius), Math.max(0, radius)), this.canvasKit.ClipOp.Intersect, true);
            canvas.drawImageRect(frame, [
                imageLayout.source.x,
                imageLayout.source.y,
                imageLayout.source.x + imageLayout.source.width,
                imageLayout.source.y + imageLayout.source.height,
            ], [
                content.left + imageLayout.destination.x,
                content.top + imageLayout.destination.y,
                content.left +
                    imageLayout.destination.x +
                    imageLayout.destination.width,
                content.top +
                    imageLayout.destination.y +
                    imageLayout.destination.height,
            ], this.fillPaint, false);
            canvas.restore();
        }
        if (!playback) {
            this.drawPlayGlyph(canvas, content.left + content.width / 2, content.top + content.height / 2, Math.max(16, Math.min(content.width, content.height) * 0.12), EMPTY_FOREGROUND, node.opacity);
            return;
        }
        this.drawControls(canvas, layout, playback, node.opacity);
    }
    drawLightbox(canvas, viewport, playback) {
        this.configurePaints();
        const layout = layoutSkiaVideoLightboxControls(viewport);
        const frame = this.resources.getVideoFrame(playback.id);
        if (frame) {
            const imageLayout = calculateImageLayout(frame.width(), frame.height(), layout.content.width, layout.content.height, "contain", "center");
            canvas.drawImageRect(frame, [
                imageLayout.source.x,
                imageLayout.source.y,
                imageLayout.source.x + imageLayout.source.width,
                imageLayout.source.y + imageLayout.source.height,
            ], [
                layout.content.left + imageLayout.destination.x,
                layout.content.top + imageLayout.destination.y,
                layout.content.left +
                    imageLayout.destination.x +
                    imageLayout.destination.width,
                layout.content.top +
                    imageLayout.destination.y +
                    imageLayout.destination.height,
            ], this.fillPaint, false);
        }
        this.drawControls(canvas, layout, playback, 1);
    }
    dispose() {
        this.fillPaint.delete();
        this.strokePaint.delete();
    }
    drawControls(canvas, layout, playback, opacity) {
        const controlsTop = layout.play.top - 6;
        this.fillPaint.setColor(this.canvasKit.parseColorString("#00000099"));
        this.fillPaint.setAlphaf(opacity);
        canvas.drawRect([
            layout.content.left,
            controlsTop,
            layout.content.left + layout.content.width,
            layout.content.top + layout.content.height,
        ], this.fillPaint);
        if (playback.status === "playing") {
            this.fillPaint.setColor(this.canvasKit.parseColorString(FOREGROUND));
            canvas.drawRect([
                layout.play.left + 6,
                layout.play.top + 5,
                layout.play.left + 10,
                layout.play.top + layout.play.height - 5,
            ], this.fillPaint);
            canvas.drawRect([
                layout.play.left + 14,
                layout.play.top + 5,
                layout.play.left + 18,
                layout.play.top + layout.play.height - 5,
            ], this.fillPaint);
        }
        else {
            this.drawPlayGlyph(canvas, layout.play.left + layout.play.width / 2, layout.play.top + layout.play.height / 2, 10);
        }
        const progress = playback.duration > 0
            ? Math.max(0, Math.min(1, playback.currentTime / playback.duration))
            : 0;
        this.strokePaint.setStrokeWidth(3);
        this.strokePaint.setColor(this.canvasKit.parseColorString("#FFFFFF66"));
        canvas.drawRect([
            layout.track.left,
            layout.track.top + 2,
            layout.track.left + layout.track.width,
            layout.track.top + 5,
        ], this.strokePaint);
        this.fillPaint.setColor(this.canvasKit.parseColorString(playback.status === "error" ? "#EF4444" : ACCENT));
        canvas.drawRect([
            layout.track.left,
            layout.track.top + 2,
            layout.track.left + layout.track.width * progress,
            layout.track.top + 5,
        ], this.fillPaint);
    }
    drawPlayGlyph(canvas, centerX, centerY, size, color = FOREGROUND, opacity = 1) {
        const builder = new this.canvasKit.PathBuilder();
        const path = builder
            .moveTo(centerX - size * 0.3, centerY - size * 0.5)
            .lineTo(centerX + size * 0.5, centerY)
            .lineTo(centerX - size * 0.3, centerY + size * 0.5)
            .close()
            .detach();
        builder.delete();
        this.fillPaint.setAlphaf(opacity);
        this.fillPaint.setColor(this.canvasKit.parseColorString(color));
        canvas.drawPath(path, this.fillPaint);
        path.delete();
    }
}
//# sourceMappingURL=skia-video-painter.js.map