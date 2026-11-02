import { getRasterSelectionRegions } from "../raster/raster-selection.js";
export function createRasterPointMapping(_document, layout) {
    return {
        sourceX: layout.source.x,
        sourceY: layout.source.y,
        sourceWidth: Math.max(1, layout.source.width),
        sourceHeight: Math.max(1, layout.source.height),
        destinationX: layout.destination.x,
        destinationY: layout.destination.y,
        destinationWidth: layout.destination.width,
        destinationHeight: layout.destination.height,
    };
}
export function mapRasterPoint(point, mapping) {
    return {
        x: mapping.destinationX +
            ((point.x - mapping.sourceX) / mapping.sourceWidth) *
                mapping.destinationWidth,
        y: mapping.destinationY +
            ((point.y - mapping.sourceY) / mapping.sourceHeight) *
                mapping.destinationHeight,
    };
}
export function clipRasterSelection(canvasKit, canvas, document, layout, selection) {
    const mapping = createRasterPointMapping(document, layout);
    const regions = getRasterSelectionRegions(selection);
    if (!regions.length)
        return;
    let combinedPath = null;
    for (const region of regions) {
        const points = region.points.map((point) => mapRasterPoint(point, mapping));
        if (!points.length)
            continue;
        const regionPath = createSelectionPath(canvasKit, region.kind, points);
        if (!combinedPath || region.operation === "replace") {
            combinedPath?.delete();
            combinedPath = regionPath;
            continue;
        }
        const operation = region.operation === "add"
            ? canvasKit.PathOp.Union
            : region.operation === "subtract"
                ? canvasKit.PathOp.Difference
                : canvasKit.PathOp.Intersect;
        const nextPath = canvasKit.Path.MakeFromOp(combinedPath, regionPath, operation);
        regionPath.delete();
        combinedPath.delete();
        if (!nextPath)
            throw new Error("Unable to combine raster selection paths");
        combinedPath = nextPath;
    }
    if (!combinedPath)
        return;
    canvas.clipPath(combinedPath, canvasKit.ClipOp.Intersect, true);
    combinedPath.delete();
}
function createSelectionPath(canvasKit, kind, points) {
    const builder = new canvasKit.PathBuilder();
    if (kind === "rectangle" && points.length >= 2) {
        const [start, end] = points;
        builder
            .moveTo(start.x, start.y)
            .lineTo(end.x, start.y)
            .lineTo(end.x, end.y)
            .lineTo(start.x, end.y)
            .lineTo(start.x, start.y);
    }
    else {
        builder.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => builder.lineTo(point.x, point.y));
        builder.lineTo(points[0].x, points[0].y);
    }
    const path = builder.detach();
    builder.delete();
    return path;
}
export function drawRasterStrokes(canvasKit, canvas, paint, document, layout) {
    const mapping = createRasterPointMapping(document, layout);
    const scale = (mapping.destinationWidth / mapping.sourceWidth +
        mapping.destinationHeight / mapping.sourceHeight) /
        2;
    for (const stroke of document.strokes) {
        if (["clone", "heal", "blur", "sharpen"].includes(stroke.mode))
            continue;
        const points = stroke.points.map((point) => mapRasterPoint(point, mapping));
        let clipped = false;
        if (stroke.selection) {
            canvas.save();
            clipRasterSelection(canvasKit, canvas, document, layout, stroke.selection);
            clipped = true;
        }
        paint.setAntiAlias(stroke.hardness < 1);
        paint.setColor(canvasKit.parseColorString(stroke.color));
        paint.setAlphaf(stroke.opacity * stroke.flow);
        paint.setStyle(canvasKit.PaintStyle.Stroke);
        paint.setStrokeCap(canvasKit.StrokeCap.Round);
        paint.setStrokeJoin(canvasKit.StrokeJoin.Round);
        paint.setStrokeWidth(Math.max(1, stroke.size * scale));
        paint.setBlendMode(stroke.mode === "erase"
            ? canvasKit.BlendMode.Clear
            : stroke.mode === "dodge"
                ? canvasKit.BlendMode.ColorDodge
                : stroke.mode === "burn"
                    ? canvasKit.BlendMode.ColorBurn
                    : canvasKit.BlendMode.SrcOver);
        if (points.length === 1) {
            canvas.drawCircle(points[0].x, points[0].y, Math.max(0.5, (stroke.size * scale) / 2), paint);
            if (clipped)
                canvas.restore();
            continue;
        }
        const builder = new canvasKit.PathBuilder();
        builder.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1))
            builder.lineTo(point.x, point.y);
        const path = builder.detach();
        builder.delete();
        try {
            canvas.drawPath(path, paint);
        }
        finally {
            path.delete();
            if (clipped)
                canvas.restore();
        }
    }
    paint.setBlendMode(canvasKit.BlendMode.SrcOver);
    paint.setAlphaf(1);
}
export function drawRasterGradients(canvasKit, canvas, paint, document, layout) {
    const mapping = createRasterPointMapping(document, layout);
    for (const gradient of document.gradients ?? []) {
        const start = mapRasterPoint(gradient.start, mapping);
        const end = mapRasterPoint(gradient.end, mapping);
        const shader = canvasKit.Shader.MakeLinearGradient([start.x, start.y], [end.x, end.y], [
            canvasKit.parseColorString(gradient.startColor),
            canvasKit.parseColorString(gradient.endColor),
        ], [0, 1], canvasKit.TileMode.Clamp);
        paint.setStyle(canvasKit.PaintStyle.Fill);
        paint.setAlphaf(gradient.opacity);
        paint.setBlendMode(canvasKit.BlendMode.SrcOver);
        paint.setShader(shader);
        canvas.drawRect([
            layout.destination.x,
            layout.destination.y,
            layout.destination.x + layout.destination.width,
            layout.destination.y + layout.destination.height,
        ], paint);
        paint.setShader(null);
        shader.delete();
    }
    paint.setAlphaf(1);
}
//# sourceMappingURL=raster-stroke-painter.js.map