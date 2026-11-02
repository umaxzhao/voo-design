const WEIGHTED_LOCAL_FONT_FAMILIES = new Set(["Source Han Sans SC"]);
export class SkiaFontManager {
    constructor(canvasKit) {
        this.canvasKit = canvasKit;
        this.fonts = new Map();
        this.pending = new Map();
        this.loadedUrls = new Set();
        this.provider = canvasKit.TypefaceFontProvider.Make();
    }
    registerFont(family, bytes) {
        if (!family.trim())
            throw new Error("Skia font family is required");
        const resources = this.fonts.get(family) ?? [];
        // CanvasKit resolves one typeface per family/style. Web fonts that are
        // split into many unicode subsets with the same CSS
        // family, so registering every subset under that name makes later glyphs
        // unreachable. Give each subset a private family and pass all of them to
        // the paragraph shaper as an ordered fallback chain.
        const registeredFamily = WEIGHTED_LOCAL_FONT_FAMILIES.has(family)
            ? family
            : resources.length === 0
                ? family
                : `${family}__subset_${resources.length}`;
        resources.push({ family, registeredFamily, bytes });
        this.fonts.set(family, resources);
        this.provider.registerFont(bytes, registeredFamily);
    }
    loadFont(family, url) {
        const key = `${family}\n${url}`;
        if (this.loadedUrls.has(key))
            return Promise.resolve();
        const existing = this.pending.get(key);
        if (existing)
            return existing;
        const request = fetch(url)
            .then((response) => {
            if (!response.ok) {
                throw new Error(`Skia font request failed (${response.status}): ${url}`);
            }
            return response.arrayBuffer();
        })
            .then((bytes) => {
            this.registerFont(family, bytes);
            this.loadedUrls.add(key);
        })
            .finally(() => this.pending.delete(key));
        this.pending.set(key, request);
        return request;
    }
    hasFont(family) {
        return (this.fonts.get(family)?.length ?? 0) > 0;
    }
    createParagraph(run, width) {
        const availableFamilies = [...this.fonts.values()].flatMap((resources) => resources.map((resource) => resource.registeredFamily));
        if (availableFamilies.length === 0)
            return null;
        const preferredFamilies = [
            ...new Set(this.fonts
                .get(run.fontFamily)
                ?.map((resource) => resource.registeredFamily) ?? []),
        ];
        const preferredFamilySet = new Set(preferredFamilies);
        const fontFamilies = [
            ...preferredFamilies,
            ...availableFamilies.filter((family) => !preferredFamilySet.has(family)),
        ];
        const textAlign = {
            left: this.canvasKit.TextAlign.Left,
            center: this.canvasKit.TextAlign.Center,
            right: this.canvasKit.TextAlign.Right,
            justify: this.canvasKit.TextAlign.Justify,
        }[run.align];
        const fontStyle = {
            slant: run.italic
                ? this.canvasKit.FontSlant.Italic
                : this.canvasKit.FontSlant.Upright,
            weight: this.resolveFontWeight(run.fontWeight),
        };
        const textStyleOptions = {
            color: this.canvasKit.parseColorString(run.color),
            fontFamilies,
            fontSize: run.fontSize,
            fontStyle,
            decoration: (run.underline ? this.canvasKit.UnderlineDecoration : 0) |
                (run.strikethrough ? this.canvasKit.LineThroughDecoration : 0),
            heightMultiplier: run.lineHeight / run.fontSize,
            letterSpacing: run.letterSpacing,
        };
        const textStyle = new this.canvasKit.TextStyle(textStyleOptions);
        const paragraphStyle = new this.canvasKit.ParagraphStyle({
            ellipsis: run.ellipsis,
            maxLines: run.maxLines,
            textAlign,
            textDirection: run.direction === "rtl"
                ? this.canvasKit.TextDirection.RTL
                : this.canvasKit.TextDirection.LTR,
            textStyle,
        });
        const builder = this.canvasKit.ParagraphBuilder.MakeFromFontProvider(paragraphStyle, this.provider);
        try {
            builder.addText(run.text);
            const paragraph = builder.build();
            paragraph.layout(Math.max(1, width));
            return paragraph;
        }
        finally {
            builder.delete();
        }
    }
    resolveFontWeight(weight) {
        if (weight >= 700)
            return this.canvasKit.FontWeight.Bold;
        if (weight >= 600)
            return this.canvasKit.FontWeight.SemiBold;
        if (weight >= 500)
            return this.canvasKit.FontWeight.Medium;
        if (weight >= 400)
            return this.canvasKit.FontWeight.Normal;
        if (weight >= 300)
            return this.canvasKit.FontWeight.Light ?? this.canvasKit.FontWeight.Normal;
        return this.canvasKit.FontWeight.ExtraLight ?? this.canvasKit.FontWeight.Normal;
    }
    async waitForPending() {
        await Promise.all(this.pending.values());
    }
    dispose() {
        this.pending.clear();
        this.loadedUrls.clear();
        this.fonts.clear();
        this.provider.delete();
    }
}
//# sourceMappingURL=font-manager.js.map