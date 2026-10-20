import { createImageAdjustmentMatrix } from "../image-adjustments.js";
const IDENTITY = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
];
function multiply(outer, inner) {
    const result = new Array(20).fill(0);
    for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 4; column += 1) {
            for (let index = 0; index < 4; index += 1) {
                result[row * 5 + column] += outer[row * 5 + index] * inner[index * 5 + column];
            }
        }
        result[row * 5 + 4] = outer[row * 5 + 4];
        for (let index = 0; index < 4; index += 1) {
            result[row * 5 + 4] += outer[row * 5 + index] * inner[index * 5 + 4];
        }
    }
    return result;
}
function withOpacity(matrix, opacity) {
    const amount = Math.max(0, Math.min(1, opacity));
    return matrix.map((value, index) => IDENTITY[index] + (value - IDENTITY[index]) * amount);
}
function interpolate(points, x) {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const left = [...sorted].reverse().find((point) => point.x <= x) ?? sorted[0];
    const right = sorted.find((point) => point.x >= x) ?? sorted[sorted.length - 1];
    if (left.x === right.x)
        return left.y;
    const amount = (x - left.x) / (right.x - left.x);
    return left.y + (right.y - left.y) * amount;
}
function channelMatrix(channel, slope, offset) {
    const matrix = [...IDENTITY];
    const channels = channel === "rgb" ? [0, 1, 2] : [channel === "red" ? 0 : channel === "green" ? 1 : 2];
    channels.forEach((index) => {
        matrix[index * 5 + index] = slope;
        matrix[index * 5 + 4] = offset;
    });
    return matrix;
}
function adjustmentMatrix(adjustment) {
    if (adjustment.type === "basic")
        return createImageAdjustmentMatrix(adjustment.params) ?? [...IDENTITY];
    if (adjustment.type === "curves") {
        const low = interpolate(adjustment.params.points, 0.25);
        const high = interpolate(adjustment.params.points, 0.75);
        const slope = (high - low) / 0.5;
        return channelMatrix(adjustment.params.channel, slope, low - slope * 0.25);
    }
    if (adjustment.type === "levels") {
        const inputRange = Math.max(1, adjustment.params.inputWhite - adjustment.params.inputBlack);
        const outputRange = adjustment.params.outputWhite - adjustment.params.outputBlack;
        const gammaSlope = 1 / Math.max(0.01, adjustment.params.gamma);
        const slope = (outputRange / inputRange) * gammaSlope;
        const offset = (adjustment.params.outputBlack - adjustment.params.inputBlack * slope) / 255;
        return channelMatrix(adjustment.params.channel, slope, offset);
    }
    const saturation = 1 + adjustment.params.saturation / 100;
    const angle = (adjustment.params.hue * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const lr = 0.213;
    const lg = 0.715;
    const lb = 0.072;
    const hue = [
        lr + cos * (1 - lr) + sin * -lr, lg + cos * -lg + sin * -lg, lb + cos * -lb + sin * (1 - lb), 0, adjustment.params.lightness / 100,
        lr + cos * -lr + sin * 0.143, lg + cos * (1 - lg) + sin * 0.14, lb + cos * -lb + sin * -0.283, 0, adjustment.params.lightness / 100,
        lr + cos * -lr + sin * -(1 - lr), lg + cos * -lg + sin * lg, lb + cos * (1 - lb) + sin * lb, 0, adjustment.params.lightness / 100,
        0, 0, 0, 1, 0,
    ];
    const sat = [
        lr * (1 - saturation) + saturation, lg * (1 - saturation), lb * (1 - saturation), 0, 0,
        lr * (1 - saturation), lg * (1 - saturation) + saturation, lb * (1 - saturation), 0, 0,
        lr * (1 - saturation), lg * (1 - saturation), lb * (1 - saturation) + saturation, 0, 0,
        0, 0, 0, 1, 0,
    ];
    return multiply(sat, hue);
}
export function createRasterAdjustmentMatrix(document, legacy) {
    const adjustments = document?.adjustments.filter((entry) => entry.enabled) ?? [];
    if (!document && legacy)
        return createImageAdjustmentMatrix(legacy);
    if (!adjustments.length)
        return null;
    return adjustments.reduce((matrix, adjustment) => multiply(withOpacity(adjustmentMatrix(adjustment), adjustment.opacity), matrix), [...IDENTITY]);
}
//# sourceMappingURL=raster-color-matrix.js.map