// Pure helper that turns a node/frame's stroke* fields into the right CSS
// properties for the chosen strokeAlign. Centralises the branching so the
// 3 node renderers (image/video/gallery) and the Frame renderer all behave
// the same way. CSS limitations:
//   outside: native `border` — grows footprint.
//   inside:  `inset` box-shadow ring — dashed/dotted downgrade to solid.
//   center:  `outline` with negative outline-offset — dashed/dotted pass
//            through via outlineStyle.
export function hasIndependentStrokeWidths(input) {
    return (input.strokeWidthTop !== undefined ||
        input.strokeWidthRight !== undefined ||
        input.strokeWidthBottom !== undefined ||
        input.strokeWidthLeft !== undefined);
}
/** True when CSS border/outline cannot faithfully paint Inspector settings. */
export function requiresSvgStroke(input) {
    return (hasIndependentStrokeWidths(input) ||
        input.strokeStyle === "dashed" ||
        input.strokeStyle === "dotted" ||
        input.strokeStyle === "custom" ||
        input.strokeDashLength !== undefined ||
        input.strokeDashGap !== undefined ||
        input.strokeDashPattern !== undefined ||
        input.strokeLineCap !== undefined ||
        input.strokeLineJoin !== undefined ||
        input.strokeMiterLimit !== undefined);
}
export function getStrokeEdgeWidths(input) {
    const fallback = Math.max(0, input.strokeWidth ?? 0);
    return {
        top: Math.max(0, input.strokeWidthTop ?? fallback),
        right: Math.max(0, input.strokeWidthRight ?? fallback),
        bottom: Math.max(0, input.strokeWidthBottom ?? fallback),
        left: Math.max(0, input.strokeWidthLeft ?? fallback),
    };
}
export function hasVisibleStroke(input) {
    if (input.strokeVisible === false)
        return false;
    return Object.values(getStrokeEdgeWidths(input)).some((width) => width > 0);
}
export function getStrokeWidthPatch(enabled) {
    if (enabled)
        return getUniformStrokeWidthPatch(1);
    return {
        strokeWidth: 0,
        strokeWidthTop: 0,
        strokeWidthRight: 0,
        strokeWidthBottom: 0,
        strokeWidthLeft: 0,
    };
}
export function getUniformStrokeWidthPatch(width) {
    return {
        strokeWidth: Math.max(0, width),
        strokeWidthTop: undefined,
        strokeWidthRight: undefined,
        strokeWidthBottom: undefined,
        strokeWidthLeft: undefined,
    };
}
export function strokeDashArray(style, width, dashLength, dashGap, dashPattern) {
    const unit = Math.max(0.5, width);
    if (style === "custom") {
        const normalized = (dashPattern ?? [])
            .filter((value) => Number.isFinite(value) && value >= 0)
            .map((value) => Number(value.toFixed(2)));
        if (normalized.length > 0) {
            const evenPattern = normalized.length % 2 === 0
                ? normalized
                : [...normalized, ...normalized];
            return evenPattern.join(" ");
        }
        return `${Math.max(0, dashLength ?? 10)} ${Math.max(0, dashGap ?? 5)}`;
    }
    if (style === "dashed") {
        return `${Math.max(0, dashLength ?? 10)} ${Math.max(0, dashGap ?? 5)}`;
    }
    if (style === "dotted") {
        return `${Math.max(0, dashLength ?? unit)} ${Math.max(0, dashGap ?? unit)}`;
    }
    return undefined;
}
const DEFAULT_MITER_LIMIT = 4;
export function miterAngleFromLimit(limit) {
    const safeLimit = Math.max(1, limit ?? DEFAULT_MITER_LIMIT);
    return (Math.asin(1 / safeLimit) * 360) / Math.PI;
}
export function miterLimitFromAngle(angle) {
    const safeAngle = Math.max(1, Math.min(180, angle));
    return 1 / Math.sin((safeAngle * Math.PI) / 360);
}
// Returns only the keys the caller should actually set — empties are
// omitted so existing styles aren't accidentally cleared by a spread.
export const getStrokeBoxStyle = (input, opts = {}) => {
    if (input.strokeVisible === false) {
        if (opts.extraBoxShadow)
            return { boxShadow: opts.extraBoxShadow };
        return {};
    }
    const sw = input.strokeWidth !== undefined
        ? input.strokeWidth
        : (opts.defaultWidth ?? 0);
    const rawStrokeColor = input.strokeColor || opts.defaultColor || "#E5E7EB";
    const strokeOpacity = Math.max(0, Math.min(100, input.strokeOpacity ?? 100));
    const sc = rawStrokeColor && strokeOpacity < 100
        ? `color-mix(in srgb, ${rawStrokeColor} ${strokeOpacity}%, transparent)`
        : rawStrokeColor;
    const ss = input.strokeStyle || "solid";
    const sa = input.strokeAlign || "center";
    const hasIndependentWidths = hasIndependentStrokeWidths(input);
    const widths = getStrokeEdgeWidths(input);
    const edgeWidths = [widths.top, widths.right, widths.bottom, widths.left];
    const insetRing = sw > 0 && sa === "inside" && sc ? `inset 0 0 0 ${sw}px ${sc}` : null;
    const chained = [insetRing, opts.extraBoxShadow].filter(Boolean).join(", ");
    const result = {};
    // Per-side mode: any stroke*Enabled flag switches rendering to per-edge
    // borders, regardless of alignment (no outline / inset ring).
    const sideFlags = [
        input.strokeTopEnabled,
        input.strokeRightEnabled,
        input.strokeBottomEnabled,
        input.strokeLeftEnabled,
    ];
    if (sideFlags.some((flag) => flag !== undefined) && sw > 0 && sc) {
        const enabled = sideFlags.map((flag) => flag !== false);
        if (enabled.every(Boolean)) {
            result.borderWidth = `${sw}px`;
        }
        else {
            result.borderTopWidth = `${enabled[0] ? widths.top : 0}px`;
            result.borderRightWidth = `${enabled[1] ? widths.right : 0}px`;
            result.borderBottomWidth = `${enabled[2] ? widths.bottom : 0}px`;
            result.borderLeftWidth = `${enabled[3] ? widths.left : 0}px`;
        }
        result.borderColor = sc;
        result.borderStyle = ss;
        if (opts.extraBoxShadow)
            result.boxShadow = opts.extraBoxShadow;
        return result;
    }
    if (hasIndependentWidths && edgeWidths.some((width) => width > 0) && sc) {
        result.borderWidth = edgeWidths.map((width) => `${width}px`).join(" ");
        result.borderColor = sc;
        result.borderStyle = ss;
        if (opts.extraBoxShadow)
            result.boxShadow = opts.extraBoxShadow;
        return result;
    }
    if (sw > 0 && sa === "outside" && sc) {
        result.borderWidth = `${sw}px`;
        result.borderColor = sc;
        result.borderStyle = ss;
    }
    else if (sw > 0 && sa === "center" && sc) {
        // Outline draws straddling the box edge. Negative offset of half the
        // width centres the line on the geometry.
        result.outlineWidth = `${sw}px`;
        result.outlineColor = sc;
        result.outlineStyle = ss;
        result.outlineOffset = `-${sw / 2}px`;
        result.borderStyle = "none";
    }
    else if (sw > 0 && sa === "inside") {
        // inset ring handled below via boxShadow; clear any visible border so
        // we don't double up.
        result.borderStyle = "none";
    }
    else {
        // No stroke or no color — keep the renderer's fallback border value.
        // Caller decides whether to default to a hairline by passing
        // defaultWidth/defaultColor when none of the above branches fire.
        if (opts.defaultWidth && opts.defaultColor) {
            result.borderWidth = `${opts.defaultWidth}px`;
            result.borderColor = opts.defaultColor;
            result.borderStyle = ss;
        }
    }
    if (chained)
        result.boxShadow = chained;
    return result;
};
// Convenience wrapper for callers that already build a React CSSProperties
// blob — just spread the returned partial.
export const strokeBoxCss = (input, opts = {}) => getStrokeBoxStyle(input, opts);
//# sourceMappingURL=stroke-style.js.map