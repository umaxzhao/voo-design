import { clipRasterSelection, createRasterPointMapping, mapRasterPoint, } from "./raster-stroke-painter.js";
const RETOUCH_MODES = new Set([
    "clone",
    "heal",
    "blur",
    "sharpen",
]);
function createBrushClip(canvasKit, stroke, document, layout) {
    if (!stroke.points.length)
        return null;
    const mapping = createRasterPointMapping(document, layout);
    const points = stroke.points.map((point) => mapRasterPoint(point, mapping));
    const builder = new canvasKit.PathBuilder();
    builder.moveTo(points[0].x, points[0].y);
    if (points.length === 1)
        builder.lineTo(points[0].x + 0.01, points[0].y);
    else
        points.slice(1).forEach((point) => builder.lineTo(point.x, point.y));
    const centerline = builder.detach();
    builder.delete();
    const scale = (mapping.destinationWidth / mapping.sourceWidth +
        mapping.destinationHeight / mapping.sourceHeight) /
        2;
    const clip = centerline.makeStroked({
        width: Math.max(1, stroke.size * scale),
        cap: canvasKit.StrokeCap.Round,
        join: canvasKit.StrokeJoin.Round,
    });
    centerline.delete();
    return clip;
}
function drawSourceImage(canvas, image, paint, layout) {
    canvas.drawImageRect(image, [
        layout.source.x,
        layout.source.y,
        layout.source.x + layout.source.width,
        layout.source.y + layout.source.height,
    ], [
        layout.destination.x,
        layout.destination.y,
        layout.destination.x + layout.destination.width,
        layout.destination.y + layout.destination.height,
    ], paint, false);
}
export function drawRasterRetouchStrokes(canvasKit, canvas, image, paint, document, layout) {
    const mapping = createRasterPointMapping(document, layout);
    for (const stroke of document.strokes) {
        if (!RETOUCH_MODES.has(stroke.mode))
            continue;
        const clip = createBrushClip(canvasKit, stroke, document, layout);
        if (!clip)
            continue;
        canvas.save();
        if (stroke.selection) {
            clipRasterSelection(canvasKit, canvas, document, layout, stroke.selection);
        }
        canvas.clipPath(clip, canvasKit.ClipOp.Intersect, true);
        clip.delete();
        paint.setAlphaf(stroke.opacity * stroke.flow);
        if (stroke.mode === "blur") {
            const sigma = Math.max(0.5, stroke.size * (1 - stroke.hardness) * 0.08);
            const filter = canvasKit.ImageFilter.MakeBlur(sigma, sigma, canvasKit.TileMode.Decal, null);
            canvas.saveLayer(undefined, null, filter);
            canvas.restore();
            filter.delete();
        }
        else {
            if ((stroke.mode === "clone" || stroke.mode === "heal") && stroke.sourcePoint) {
                const source = mapRasterPoint(stroke.sourcePoint, mapping);
                const target = mapRasterPoint(stroke.points[0], mapping);
                canvas.translate(target.x - source.x, target.y - source.y);
            }
            paint.setBlendMode(stroke.mode === "heal"
                ? canvasKit.BlendMode.SoftLight
                : canvasKit.BlendMode.SrcOver);
            const colorFilter = stroke.mode === "sharpen" && canvasKit.ColorFilter
                ? canvasKit.ColorFilter.MakeMatrix([
                    1.15, 0, 0, 0, -0.075,
                    0, 1.15, 0, 0, -0.075,
                    0, 0, 1.15, 0, -0.075,
                    0, 0, 0, 1, 0,
                ])
                : null;
            paint.setColorFilter?.(colorFilter);
            drawSourceImage(canvas, image, paint, layout);
            paint.setColorFilter?.(null);
            colorFilter?.delete();
        }
        paint.setBlendMode(canvasKit.BlendMode.SrcOver);
        paint.setAlphaf(1);
        canvas.restore();
    }
}
//# sourceMappingURL=raster-retouch-painter.js.map