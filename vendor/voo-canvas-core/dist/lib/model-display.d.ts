/**
 * Display-only formatting for model ids. Storage and API calls always use the
 * full id; this helper only shortens the string shown in pickers and chips.
 *
 * Rules, applied in order:
 * 1. Strip path prefixes: everything up to and including the last `/`.
 * 2. Strip known vendor prefixes: leading `doubao-`, `bytedance-`, `volc-`
 *    (lowercase match).
 * 3. Strip trailing date stamps: a trailing `-DDMMYY`-style `-\d{6}` segment,
 *    possibly repeated.
 * 4. Version dashes become dots: a dash between two digits becomes `.`
 *    (`2-0` → `2.0`).
 * 5. Glue a letter-word to a following version: a dash between a letter and a
 *    digit is removed, but only when the digits start a version-like tail —
 *    `\d+(\.\d+)*` followed by another dash or the end of the string. This
 *    glues `seedance-2.0` → `seedance2.0` and `gemini-2.5-flash-image` →
 *    `gemini2.5-flash-image`, while leaving `Hunyuan-MT-7B` alone (the `7`
 *    there is followed by `B`, i.e. it is a size suffix, not a version).
 * 6. Empty/whitespace input is returned unchanged; the function never throws.
 */
export declare function formatModelDisplayName(id: string): string;
//# sourceMappingURL=model-display.d.ts.map