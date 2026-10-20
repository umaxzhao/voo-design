/** Curated set of popular Google Fonts. When selected or rendered, these will be dynamically fetched. */
export declare const GOOGLE_FONT_NAMES: ReadonlySet<string>;
/** Bundled locally so CanvasKit can use it without a system-font fallback. */
export declare const SOURCE_HAN_SANS_SC = "Source Han Sans SC";
/** Return the bundled Source Han face that CanvasKit should register. */
export declare function sourceHanSansFontUrls(weight: number): readonly string[];
/** Extract the leading family from a CSS font stack for font loading. */
export declare function primaryFontFamily(fontStack: string): string;
/**
 * CanvasKit only receives web fonts that the scene manager can register. For
 * system-only Figma families, choose the same dependable fallback in both
 * the Skia scene and the DOM editor rather than letting each renderer pick a
 * different local substitute.
 */
export declare function resolveCanvasFontFamily(fontStack: string | undefined, text: string): string;
/** Dynamically appends a link tag for Google Fonts in document head if not present */
export declare function loadGoogleFont(fontStack: string): HTMLLinkElement | null;
/** The default ordered list shown in the Inspector's Font Family
 *  dropdown. Recent-MRU custom entries are prepended at the call site. */
export declare const DEFAULT_FONT_STACK = "\"Source Han Sans SC\", sans-serif";
export declare const DEFAULT_FONT_STACKS: readonly string[];
/** O(1) lookup for "is this a curated default" — useful at MRU-commit
 *  sites that want to skip persisting the built-ins. */
export declare const DEFAULT_FONT_STACK_SET: ReadonlySet<string>;
/**
 * Pretty display name for a CSS font-family stack — extracts the FIRST
 * font name, strips wrapping quotes, and trims surrounding whitespace.
 *
 *   `"Times New Roman", Times, serif`  → `Times New Roman`
 *   `Inter, system-ui, sans-serif`     → `Inter`
 *   `Menlo, Monaco, "Courier New", monospace` → `Menlo`
 *
 * Returns the original stack unchanged if parsing fails (empty input,
 * unparseable shape) so the dropdown never shows a blank row.
 */
export declare function labelForFontStack(stack: string): string;
//# sourceMappingURL=font-stacks.d.ts.map