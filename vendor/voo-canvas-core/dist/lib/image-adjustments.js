export const DEFAULT_IMAGE_ADJUSTMENTS = {
    exposure: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
};
const clamp = (value) => Math.max(-100, Math.min(100, value));
export function normalizeImageAdjustments(value) {
    return {
        exposure: clamp(value?.exposure ?? 0),
        contrast: clamp(value?.contrast ?? 0),
        saturation: clamp(value?.saturation ?? 0),
        temperature: clamp(value?.temperature ?? 0),
        tint: clamp(value?.tint ?? 0),
        highlights: clamp(value?.highlights ?? 0),
        shadows: clamp(value?.shadows ?? 0),
    };
}
const IDENTITY = [
    1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
];
function multiply(left, right) {
    const result = new Array(20).fill(0);
    for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 5; column += 1) {
            const index = row * 5 + column;
            if (column === 4)
                result[index] = left[index];
            for (let inner = 0; inner < 4; inner += 1) {
                result[index] += left[row * 5 + inner] * right[inner * 5 + column];
            }
        }
    }
    return result;
}
/** Builds the CanvasKit 4x5 color matrix used for live image-fill adjustments. */
export function createImageAdjustmentMatrix(input) {
    const value = normalizeImageAdjustments(input);
    if (Object.values(value).every((item) => item === 0))
        return null;
    const exposure = 2 ** (value.exposure / 100);
    const contrast = 1 + value.contrast / 100;
    const contrastOffset = 0.5 * (1 - contrast);
    const saturation = 1 + value.saturation / 100;
    const inverseSaturation = 1 - saturation;
    const temperature = value.temperature / 500;
    const tint = value.tint / 667;
    const highlights = value.highlights / 500;
    const shadows = value.shadows / 500;
    const exposureMatrix = [
        exposure,
        0,
        0,
        0,
        0,
        0,
        exposure,
        0,
        0,
        0,
        0,
        0,
        exposure,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
    ];
    const contrastMatrix = [
        contrast,
        0,
        0,
        0,
        contrastOffset,
        0,
        contrast,
        0,
        0,
        contrastOffset,
        0,
        0,
        contrast,
        0,
        contrastOffset,
        0,
        0,
        0,
        1,
        0,
    ];
    const saturationMatrix = [
        0.213 * inverseSaturation + saturation,
        0.715 * inverseSaturation,
        0.072 * inverseSaturation,
        0,
        0,
        0.213 * inverseSaturation,
        0.715 * inverseSaturation + saturation,
        0.072 * inverseSaturation,
        0,
        0,
        0.213 * inverseSaturation,
        0.715 * inverseSaturation,
        0.072 * inverseSaturation + saturation,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
    ];
    const toneMatrix = [
        1 + temperature + highlights,
        0,
        0,
        0,
        shadows + tint / 2,
        0,
        1 - Math.abs(tint) / 2 + highlights,
        0,
        0,
        shadows - tint,
        0,
        0,
        1 - temperature + highlights,
        0,
        shadows + tint / 2,
        0,
        0,
        0,
        1,
        0,
    ];
    return [exposureMatrix, contrastMatrix, saturationMatrix, toneMatrix].reduce((matrix, next) => multiply(next, matrix), [...IDENTITY]);
}
//# sourceMappingURL=image-adjustments.js.map