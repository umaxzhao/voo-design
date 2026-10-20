const POSITION_FACTORS = {
    "top-left": [0, 0],
    top: [0.5, 0],
    "top-right": [1, 0],
    left: [0, 0.5],
    center: [0.5, 0.5],
    right: [1, 0.5],
    "bottom-left": [0, 1],
    bottom: [0.5, 1],
    "bottom-right": [1, 1],
};
export function calculateImageLayout(imageWidth, imageHeight, targetWidth, targetHeight, fit, position) {
    const source = { x: 0, y: 0, width: imageWidth, height: imageHeight };
    if (fit === "fill") {
        return {
            source,
            destination: { x: 0, y: 0, width: targetWidth, height: targetHeight },
        };
    }
    const [factorX, factorY] = POSITION_FACTORS[position];
    if (fit === "cover") {
        const scale = Math.max(targetWidth / imageWidth, targetHeight / imageHeight);
        const sourceWidth = targetWidth / scale;
        const sourceHeight = targetHeight / scale;
        return {
            source: {
                x: (imageWidth - sourceWidth) * factorX,
                y: (imageHeight - sourceHeight) * factorY,
                width: sourceWidth,
                height: sourceHeight,
            },
            destination: { x: 0, y: 0, width: targetWidth, height: targetHeight },
        };
    }
    const scale = fit === "contain"
        ? Math.min(targetWidth / imageWidth, targetHeight / imageHeight)
        : 1;
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return {
        source,
        destination: {
            x: (targetWidth - width) * factorX,
            y: (targetHeight - height) * factorY,
            width,
            height,
        },
    };
}
//# sourceMappingURL=image-layout.js.map