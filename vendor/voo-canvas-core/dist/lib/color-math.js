// Color space conversions for the inspector color picker. Extracted from
// components/panels/FigmaColorPicker.tsx into a pure module so the picker
// sub-components (SV box, channel inputs, swatches) share one
// implementation and the math is unit-testable without a DOM.
//
// Conventions:
//   - hex strings are uppercase 6-digit with leading "#" ("#A640FF").
//   - hsv channels: h 0-360, s 0-100, v 0-100.
//   - rgb channels: 0-255 integers.
// Parse "#RGB" / "#RRGGBB" / "#RRGGBBAA" into channel integers. Alpha is
// dropped (callers handle opacity separately). Returns null for junk so
// callers can reject half-typed input without committing.
export function hexToRgb(hex) {
    let c = hex.replace("#", "").trim();
    if (c.length === 3) {
        c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }
    else if (c.length === 8) {
        c = c.slice(0, 6);
    }
    if (c.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(c)) {
        return null;
    }
    return {
        r: parseInt(c.slice(0, 2), 16),
        g: parseInt(c.slice(2, 4), 16),
        b: parseInt(c.slice(4, 6), 16),
    };
}
const toHexChannel = (x) => {
    const clamped = Math.max(0, Math.min(255, Math.round(x)));
    return clamped.toString(16).padStart(2, "0");
};
export function rgbToHex({ r, g, b }) {
    return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`.toUpperCase();
}
// Normalize user-typed hex into the canonical "#RRGGBB" uppercase form.
// Accepts 3/6/8-digit (alpha stripped) with or without "#". Null = invalid.
export function normalizeHex(input) {
    const rgb = hexToRgb(input);
    return rgb ? rgbToHex(rgb) : null;
}
// Parse the alpha byte of an 8-digit hex ("#RRGGBBAA" → 0-100, rounded).
// 6/3-digit input is fully opaque (100); junk is fully opaque too so
// callers never nuke a color by accident.
export function hexAlphaPercent(hex) {
    const c = hex.replace("#", "").trim();
    if (c.length !== 8)
        return 100;
    return Math.round((parseInt(c.slice(6, 8), 16) / 255) * 100);
}
// Fold an opacity percentage into a hex color's alpha channel. Existing
// 8-digit alpha is multiplied at BYTE precision (no percent round-trip,
// so opacity=100 preserves the original alpha exactly). Returns a
// 6-digit hex when the result is fully opaque, 8-digit otherwise.
// Non-hex input (named colors, rgb()) passes through untouched — callers
// should treat that as "opacity not applicable".
export function withAlpha(hex, opacityPercent) {
    const rgb = hexToRgb(hex);
    if (!rgb)
        return hex;
    const c = hex.replace("#", "").trim();
    const baseByte = c.length === 8 ? parseInt(c.slice(6, 8), 16) : 255;
    const effByte = Math.round(Math.max(0, Math.min(255, (baseByte * opacityPercent) / 100)));
    if (effByte >= 255)
        return rgbToHex(rgb);
    const alphaHex = effByte.toString(16).padStart(2, "0");
    return `${rgbToHex(rgb)}${alphaHex}`.toUpperCase();
}
export function hexToHsv(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) {
        return { h: 0, s: 0, v: 100 };
    }
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (max !== min) {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        v: Math.round(v * 100),
    };
}
export function hsvToHex(h, s, v) {
    s /= 100;
    v /= 100;
    const i = Math.floor((h / 60) % 6);
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r = 0, g = 0, b = 0;
    switch (i) {
        case 0:
            r = v;
            g = t;
            b = p;
            break;
        case 1:
            r = q;
            g = v;
            b = p;
            break;
        case 2:
            r = p;
            g = v;
            b = t;
            break;
        case 3:
            r = p;
            g = q;
            b = v;
            break;
        case 4:
            r = t;
            g = p;
            b = v;
            break;
        case 5:
            r = v;
            g = p;
            b = q;
            break;
    }
    return rgbToHex({
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
    });
}
//# sourceMappingURL=color-math.js.map