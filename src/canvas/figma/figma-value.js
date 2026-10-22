export function figmaObject(value) {
    return value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Uint8Array)
        ? value
        : null;
}
export function figmaArray(value) {
    return Array.isArray(value) ? value : [];
}
export function figmaNumber(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function figmaString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}
export function figmaGuid(value) {
    const guid = figmaObject(value);
    if (!guid)
        return null;
    return `${figmaNumber(guid.sessionID)}:${figmaNumber(guid.localID)}`;
}
export function figmaBytes(value) {
    return value instanceof Uint8Array ? value : null;
}
function channelHex(value) {
    return Math.round(Math.max(0, Math.min(1, value)) * 255)
        .toString(16)
        .padStart(2, "0");
}
export function figmaColor(value) {
    const color = figmaObject(value);
    if (!color)
        return null;
    return {
        hex: `#${channelHex(figmaNumber(color.r))}${channelHex(figmaNumber(color.g))}${channelHex(figmaNumber(color.b))}`,
        opacity: Math.max(0, Math.min(100, figmaNumber(color.a, 1) * 100)),
    };
}
export function figmaPaint(value, type) {
    for (const entry of figmaArray(value)) {
        const paint = figmaObject(entry);
        if (!paint || paint.visible === false)
            continue;
        if (!type || figmaString(paint.type) === type)
            return paint;
    }
    return null;
}
export function figmaHashHex(value) {
    const bytes = figmaBytes(value);
    if (!bytes || bytes.length === 0)
        return null;
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
