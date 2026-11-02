// font-stacks — curated list of CSS font-family stacks the Inspector's
// Font Family picker offers by default, plus the helper that derives a
// pretty display label from any user-supplied stack.
//
// Each stack is a full CSS `font-family` value (with quotes around names
// containing spaces), so the value the user picks is paste-ready into
// any styled component / DOM `style.fontFamily` assignment.
//
// Extracted from components/panels/InspectorPanel.tsx so:
//   1. Future "add Open Sans" / "drop Times New Roman" tweaks are a
//      single-file change without searching the 5000-line panel.
//   2. The pure label-derivation logic gains explicit test coverage.
//   3. Other UI surfaces (a future Frame title-font picker, a
//      WorkspaceContainer global default selector) can share the same
//      curated list.
/** Curated set of popular Google Fonts. When selected or rendered, these will be dynamically fetched. */
export const GOOGLE_FONT_NAMES = new Set([
    "Inter",
    "Roboto",
    "Open Sans",
    "Montserrat",
    "Poppins",
    "Lato",
    "Oswald",
    "Raleway",
    "Nunito",
    "Playfair Display",
    "Merriweather",
    "Lora",
    "PT Serif",
    // Metric-compatible substitutes, not picker entries: Arimo matches
    // Arial/Helvetica advance widths and Tinos matches Times. Figma documents
    // authored against those system faces (or against URW's Nimbus clones) keep
    // their line breaks only if we can render a face with the same metrics.
    "Arimo",
    "Tinos",
    "Fira Code",
    "JetBrains Mono",
    "Source Code Pro",
    "Roboto Mono",
    "Noto Sans SC",
    "Noto Serif SC",
    "ZCOOL Xiaowei",
    "Ma Shan Zheng",
    "Long Cang",
]);
/** Bundled locally so CanvasKit can use it without a system-font fallback. */
export const SOURCE_HAN_SANS_SC = "Source Han Sans SC";
/** Return the bundled Source Han face that CanvasKit should register. */
export function sourceHanSansFontUrls(weight) {
    if (weight >= 600) {
        return ["/fonts/source-han-sans-sc/SourceHanSansSC-Bold.otf"];
    }
    if (weight >= 500) {
        return ["/fonts/source-han-sans-sc/SourceHanSansSC-Medium.otf"];
    }
    return ["/fonts/source-han-sans-sc/SourceHanSansSC-Regular.otf"];
}
/** Extract the leading family from a CSS font stack for font loading. */
export function primaryFontFamily(fontStack) {
    return (fontStack
        .split(",")[0]
        ?.replace(/^['"]|['"]$/g, "")
        .trim() ?? "");
}
/**
 * CanvasKit only receives web fonts that the scene manager can register. For
 * system-only Figma families, choose the same dependable fallback in both
 * the Skia scene and the DOM editor rather than letting each renderer pick a
 * different local substitute.
 */
export function resolveCanvasFontFamily(fontStack, text) {
    const requested = fontStack
        ? primaryFontFamily(fontStack)
        : SOURCE_HAN_SANS_SC;
    if (GOOGLE_FONT_NAMES.has(requested) || requested === SOURCE_HAN_SANS_SC)
        return requested;
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)
        ? SOURCE_HAN_SANS_SC
        : "Inter";
}
/** Dynamically appends a link tag for Google Fonts in document head if not present */
export function loadGoogleFont(fontStack) {
    if (typeof window === "undefined")
        return null;
    const fontName = primaryFontFamily(fontStack);
    if (!GOOGLE_FONT_NAMES.has(fontName))
        return null;
    const id = `google-font-${fontName.toLowerCase().replace(/\s+/g, "-")}`;
    const existing = document.getElementById(id);
    if (existing instanceof HTMLLinkElement)
        return existing;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    const encodedName = fontName.replace(/\s+/g, "+");
    link.href = `https://fonts.googleapis.com/css2?family=${encodedName}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
    return link;
}
/** The default ordered list shown in the Inspector's Font Family
 *  dropdown. Recent-MRU custom entries are prepended at the call site. */
export const DEFAULT_FONT_STACK = '"Source Han Sans SC", sans-serif';
export const DEFAULT_FONT_STACKS = [
    DEFAULT_FONT_STACK,
    "Inter, system-ui, sans-serif",
    "system-ui, -apple-system, sans-serif",
    "Helvetica, Arial, sans-serif",
    "Arial, sans-serif",
    "Georgia, serif",
    '"Times New Roman", Times, serif',
    '"Courier New", Courier, monospace',
    'Menlo, Monaco, "Courier New", monospace',
    // Curated premium Google Fonts (Sans-serif)
    '"Roboto", sans-serif',
    '"Open Sans", sans-serif',
    '"Montserrat", sans-serif',
    '"Poppins", sans-serif',
    '"Lato", sans-serif',
    '"Oswald", sans-serif',
    '"Raleway", sans-serif',
    '"Nunito", sans-serif',
    // Curated premium Google Fonts (Serif)
    '"Playfair Display", serif',
    '"Merriweather", serif',
    '"Lora", serif',
    '"PT Serif", serif',
    // Curated premium Google Fonts (Monospace)
    '"Fira Code", monospace',
    '"JetBrains Mono", monospace',
    '"Source Code Pro", monospace',
    '"Roboto Mono", monospace',
    // Curated premium Google Fonts (Chinese support)
    '"Noto Sans SC", sans-serif',
    '"Noto Serif SC", serif',
    '"ZCOOL Xiaowei", serif',
    '"Ma Shan Zheng", cursive, sans-serif',
    '"Long Cang", cursive, sans-serif',
    // Enriched common cross-platform system fonts
    "Impact, sans-serif",
    '"Comic Sans MS", cursive, sans-serif',
    '"Trebuchet MS", sans-serif',
    "Verdana, Geneva, sans-serif",
    "Tahoma, Geneva, sans-serif",
    '"Century Gothic", sans-serif',
    "Garamond, Baskerville, serif",
    "Bookman, Georgia, serif",
    '"American Typewriter", serif',
];
/** O(1) lookup for "is this a curated default" — useful at MRU-commit
 *  sites that want to skip persisting the built-ins. */
export const DEFAULT_FONT_STACK_SET = new Set(DEFAULT_FONT_STACKS);
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
export function labelForFontStack(stack) {
    const first = stack
        .split(",")[0]
        ?.replace(/^["']|["']$/g, "")
        .trim();
    return first || stack;
}
//# sourceMappingURL=font-stacks.js.map