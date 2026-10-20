export declare function browserFontFamilyMatches(cssFamily: string, requestedFamily: string): boolean;
export declare function unicodeRangeContainsText(unicodeRange: string, text: string): boolean;
/** Whether a CSS @font-face weight declaration can satisfy a requested weight. */
export declare function fontFaceSupportsWeight(fontFaceWeight: string, requestedWeight: number): boolean;
export declare function findBrowserFontUrls(familyHint: string, text: string, options?: {
    fontWeight?: number;
}): string[];
export declare function findBrowserFontUrl(familyHint: string): string | null;
//# sourceMappingURL=browser-font-source.d.ts.map