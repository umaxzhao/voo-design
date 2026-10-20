function unquote(value) {
    return value.trim().replace(/^['"]|['"]$/g, "");
}
/**
 * next/font rewrites a CSS family such as `Noto Sans SC` to an internal
 * identifier like `__Noto_Sans_SC_abc`. Match the semantic family rather
 * than requiring byte-for-byte CSS names, otherwise CanvasKit never receives
 * the preloaded CJK subset and text stays blank until a remote fallback wins.
 */
function normalizedFamily(value) {
    return unquote(value).toLocaleLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "");
}
export function browserFontFamilyMatches(cssFamily, requestedFamily) {
    const css = normalizedFamily(cssFamily);
    const requested = normalizedFamily(requestedFamily);
    return Boolean(css && requested && css.includes(requested));
}
function extractUrl(source) {
    const match = source.match(/url\(([^)]+)\)/i);
    return match ? unquote(match[1]) : null;
}
function parseUnicodeRanges(unicodeRange) {
    return unicodeRange.split(",").flatMap((rawRange) => {
        const range = rawRange.trim().replace(/^U\+/i, "");
        if (!range)
            return [];
        if (range.includes("?")) {
            const start = Number.parseInt(range.replaceAll("?", "0"), 16);
            const end = Number.parseInt(range.replaceAll("?", "F"), 16);
            return Number.isFinite(start) && Number.isFinite(end)
                ? [[start, end]]
                : [];
        }
        const [rawStart, rawEnd] = range.split("-");
        const start = Number.parseInt(rawStart, 16);
        const end = Number.parseInt(rawEnd ?? rawStart, 16);
        return Number.isFinite(start) && Number.isFinite(end) ? [[start, end]] : [];
    });
}
function lowerBound(values, target) {
    let start = 0;
    let end = values.length;
    while (start < end) {
        const middle = Math.floor((start + end) / 2);
        if ((values[middle] ?? Number.POSITIVE_INFINITY) < target)
            start = middle + 1;
        else
            end = middle;
    }
    return start;
}
function unicodeRangeContainsCodePoints(unicodeRange, sortedCodePoints) {
    if (!unicodeRange.trim())
        return true;
    return parseUnicodeRanges(unicodeRange).some(([start, end]) => {
        const candidate = sortedCodePoints[lowerBound(sortedCodePoints, start)];
        return candidate !== undefined && candidate <= end;
    });
}
function uniqueSortedCodePoints(text) {
    return [
        ...new Set([...text].flatMap((character) => {
            const codePoint = character.codePointAt(0);
            return codePoint === undefined ? [] : [codePoint];
        })),
    ].sort((left, right) => left - right);
}
export function unicodeRangeContainsText(unicodeRange, text) {
    return unicodeRangeContainsCodePoints(unicodeRange, uniqueSortedCodePoints(text));
}
function parseFontWeight(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "normal")
        return 400;
    if (normalized === "bold")
        return 700;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
}
/** Whether a CSS @font-face weight declaration can satisfy a requested weight. */
export function fontFaceSupportsWeight(fontFaceWeight, requestedWeight) {
    const weights = fontFaceWeight.trim().split(/\s+/);
    if (weights.length === 0 || !weights[0])
        return true;
    const start = parseFontWeight(weights[0]);
    const end = parseFontWeight(weights[1] ?? weights[0]);
    if (start === null || end === null)
        return true;
    return requestedWeight >= Math.min(start, end) && requestedWeight <= Math.max(start, end);
}
export function findBrowserFontUrls(familyHint, text, options) {
    const urls = new Set();
    const codePoints = uniqueSortedCodePoints(text);
    for (const sheet of document.styleSheets) {
        let rules;
        try {
            rules = sheet.cssRules;
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "SecurityError")
                continue;
            throw error;
        }
        for (const rule of rules) {
            if (!(rule instanceof CSSFontFaceRule))
                continue;
            const family = unquote(rule.style.getPropertyValue("font-family"));
            if (!browserFontFamilyMatches(family, familyHint))
                continue;
            if (options?.fontWeight !== undefined &&
                !fontFaceSupportsWeight(rule.style.getPropertyValue("font-weight"), options.fontWeight)) {
                continue;
            }
            if (!unicodeRangeContainsCodePoints(rule.style.getPropertyValue("unicode-range"), codePoints)) {
                continue;
            }
            const url = extractUrl(rule.style.getPropertyValue("src"));
            if (url)
                urls.add(new URL(url, sheet.href ?? document.baseURI).toString());
        }
    }
    return [...urls];
}
export function findBrowserFontUrl(familyHint) {
    return findBrowserFontUrls(familyHint, "Aa")[0] ?? null;
}
//# sourceMappingURL=browser-font-source.js.map