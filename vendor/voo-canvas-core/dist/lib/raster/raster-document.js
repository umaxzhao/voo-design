import { normalizeImageAdjustments } from "../image-adjustments.js";
export const RASTER_DOCUMENT_VERSION = 1;
export const RASTER_ALGORITHM_VERSION = 1;
const clamp = (value, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
function assertId(id, label) {
    if (!id.trim())
        throw new TypeError(`${label} id must not be empty`);
}
function adjustmentBase(id) {
    assertId(id, "Adjustment");
    return { id, enabled: true, opacity: 1, algorithmVersion: RASTER_ALGORITHM_VERSION };
}
export function createRasterDocument(source, legacy) {
    if (!source.url.trim())
        throw new TypeError("Raster source URL must not be empty");
    if (source.kind === "asset" && !source.assetId?.trim())
        throw new TypeError("Asset raster sources require an asset id");
    const basic = normalizeImageAdjustments(legacy);
    return {
        version: RASTER_DOCUMENT_VERSION,
        revision: 1,
        source: { ...source, colorSpace: "srgb" },
        transform: { rotation: 0, flipHorizontal: false, flipVertical: false, offsetX: 0, offsetY: 0 },
        adjustments: Object.values(basic).some((value) => value !== 0)
            ? [createBasicAdjustment("legacy-basic", basic)]
            : [],
        strokes: [],
        gradients: [],
    };
}
export function normalizeRasterDocument(document) {
    if (document.version !== RASTER_DOCUMENT_VERSION) {
        throw new RangeError(`Unsupported raster document version: ${document.version}`);
    }
    if (!document.source.url.trim()) {
        throw new TypeError("Raster source URL must not be empty");
    }
    return {
        ...document,
        revision: Number.isInteger(document.revision) && document.revision > 0
            ? document.revision
            : 1,
        transform: {
            rotation: document.transform?.rotation ?? 0,
            flipHorizontal: document.transform?.flipHorizontal ?? false,
            flipVertical: document.transform?.flipVertical ?? false,
            offsetX: document.transform?.offsetX ?? 0,
            offsetY: document.transform?.offsetY ?? 0,
        },
        adjustments: document.adjustments ?? [],
        strokes: document.strokes ?? [],
        gradients: document.gradients ?? [],
    };
}
export function createBasicAdjustment(id, params) {
    return { ...adjustmentBase(id), type: "basic", params: normalizeImageAdjustments(params) };
}
export function createCurvesAdjustment(id, channel = "rgb") {
    return { ...adjustmentBase(id), type: "curves", params: { channel, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } };
}
export function createHslAdjustment(id) {
    return { ...adjustmentBase(id), type: "hsl", params: { hue: 0, saturation: 0, lightness: 0, colorize: false } };
}
export function createLevelsAdjustment(id, channel = "rgb") {
    return { ...adjustmentBase(id), type: "levels", params: { channel, inputBlack: 0, inputWhite: 255, gamma: 1, outputBlack: 0, outputWhite: 255 } };
}
export function normalizeCurvePoints(points) {
    if (points.length < 2)
        throw new RangeError("Curves require at least two control points");
    return points.map((point) => ({ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) })).sort((a, b) => a.x - b.x);
}
export function normalizeHslParams(params) {
    const hue = Number.isFinite(params.hue) ? params.hue : 0;
    return { hue: ((hue % 360) + 360) % 360, saturation: clamp(params.saturation, -100, 100), lightness: clamp(params.lightness, -100, 100), colorize: params.colorize === true };
}
export function normalizeLevelsParams(params) {
    const inputBlack = clamp(params.inputBlack, 0, 254);
    const outputBlack = clamp(params.outputBlack, 0, 254);
    return { channel: params.channel, inputBlack, inputWhite: clamp(params.inputWhite, inputBlack + 1, 255), gamma: clamp(params.gamma, 0.01, 9.99), outputBlack, outputWhite: clamp(params.outputWhite, outputBlack + 1, 255) };
}
export function addRasterAdjustment(document, adjustment) {
    assertId(adjustment.id, "Adjustment");
    if (document.adjustments.some((entry) => entry.id === adjustment.id))
        throw new Error(`Raster adjustment ${adjustment.id} already exists`);
    return { ...document, revision: document.revision + 1, adjustments: [...document.adjustments, adjustment] };
}
export function replaceRasterAdjustment(document, adjustment) {
    const index = document.adjustments.findIndex((entry) => entry.id === adjustment.id);
    if (index < 0)
        throw new RangeError(`Raster adjustment ${adjustment.id} was not found`);
    const adjustments = [...document.adjustments];
    adjustments[index] = { ...adjustment, opacity: clamp(adjustment.opacity, 0, 1) };
    return { ...document, revision: document.revision + 1, adjustments };
}
export function removeRasterAdjustment(document, id) {
    if (!document.adjustments.some((entry) => entry.id === id))
        throw new RangeError(`Raster adjustment ${id} was not found`);
    return { ...document, revision: document.revision + 1, adjustments: document.adjustments.filter((entry) => entry.id !== id) };
}
export function moveRasterAdjustment(document, sourceId, targetId) {
    const adjustments = [...document.adjustments];
    const sourceIndex = adjustments.findIndex((entry) => entry.id === sourceId);
    const targetIndex = adjustments.findIndex((entry) => entry.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0)
        throw new RangeError("Both raster adjustments must exist before reordering");
    if (sourceIndex === targetIndex)
        return document;
    const moved = adjustments.splice(sourceIndex, 1)[0];
    adjustments.splice(targetIndex, 0, moved);
    return { ...document, revision: document.revision + 1, adjustments };
}
export function appendRasterStroke(document, stroke) {
    assertId(stroke.id, "Stroke");
    if (!stroke.points.length)
        throw new RangeError("Raster strokes require at least one point");
    if (document.strokes.some((entry) => entry.id === stroke.id))
        throw new Error(`Raster stroke ${stroke.id} already exists`);
    return { ...document, revision: document.revision + 1, strokes: [...document.strokes, { ...stroke, size: clamp(stroke.size, 1, 4096), hardness: clamp(stroke.hardness, 0, 1), opacity: clamp(stroke.opacity, 0, 1), flow: clamp(stroke.flow, 0, 1), points: stroke.points.map((point) => ({ ...point, pressure: clamp(point.pressure, 0, 1) })) }] };
}
export function appendRasterGradient(document, gradient) {
    assertId(gradient.id, "Gradient");
    if (document.gradients.some((entry) => entry.id === gradient.id)) {
        throw new Error(`Raster gradient ${gradient.id} already exists`);
    }
    return {
        ...document,
        revision: document.revision + 1,
        gradients: [
            ...document.gradients,
            { ...gradient, opacity: clamp(gradient.opacity, 0, 1) },
        ],
    };
}
//# sourceMappingURL=raster-document.js.map