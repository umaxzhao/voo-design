import { layoutSkiaImageToolbar, SKIA_IMAGE_TOOLBAR_ITEM_WIDTH, } from "./skia-image-toolbar.js";
export class SkiaImageToolbarPainter {
    constructor(canvasKit, fonts) {
        this.canvasKit = canvasKit;
        this.fonts = fonts;
        this.fillPaint = new canvasKit.Paint();
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(canvasKit.PaintStyle.Fill);
        this.strokePaint = new canvasKit.Paint();
        this.strokePaint.setAntiAlias(true);
        this.strokePaint.setStyle(canvasKit.PaintStyle.Stroke);
        this.strokePaint.setStrokeWidth(1);
    }
    draw(canvas, toolbar, viewport) {
        const layout = layoutSkiaImageToolbar(toolbar, viewport);
        this.fillPaint.setColor(this.canvasKit.parseColorString("#FFFFFF"));
        canvas.drawRRect(this.canvasKit.RRectXY([
            layout.left,
            layout.top,
            layout.left + layout.width,
            layout.top + layout.height,
        ], 18, 18), this.fillPaint);
        this.strokePaint.setColor(this.canvasKit.parseColorString("#E4E4E7"));
        canvas.drawRRect(this.canvasKit.RRectXY([
            layout.left + 0.5,
            layout.top + 0.5,
            layout.left + layout.width - 0.5,
            layout.top + layout.height - 0.5,
        ], 18, 18), this.strokePaint);
        toolbar.items.forEach((item, index) => {
            const itemLeft = layout.left + 4 + index * SKIA_IMAGE_TOOLBAR_ITEM_WIDTH;
            if (index === toolbar.highlightedIndex && !item.disabled) {
                this.fillPaint.setColor(this.canvasKit.parseColorString("#F4F4F5"));
                canvas.drawCircle(itemLeft + SKIA_IMAGE_TOOLBAR_ITEM_WIDTH / 2, layout.top + 18, 14, this.fillPaint);
            }
            const paragraph = this.fonts.createParagraph({
                text: item.glyph,
                color: item.disabled
                    ? "#A1A1AA"
                    : item.tone === "danger"
                        ? "#E11D48"
                        : item.tone === "active"
                            ? "#A640FF"
                            : "#27272A",
                fontFamily: "Inter",
                fontSize: 11,
                lineHeight: 18,
                fontWeight: 600,
                letterSpacing: 0,
                align: "center",
                direction: "ltr",
                maxLines: 1,
            }, SKIA_IMAGE_TOOLBAR_ITEM_WIDTH);
            if (!paragraph)
                return;
            try {
                canvas.drawParagraph(paragraph, itemLeft, layout.top + 9);
            }
            finally {
                paragraph.delete();
            }
        });
        const highlightedItem = toolbar.items[toolbar.highlightedIndex];
        if (highlightedItem && !highlightedItem.disabled) {
            this.drawTooltip(canvas, layout, toolbar.highlightedIndex, highlightedItem.label);
        }
    }
    drawTooltip(canvas, layout, index, label) {
        const width = Math.max(48, Math.min(180, label.length * 7 + 16));
        const height = 24;
        const itemCenter = layout.left +
            4 +
            index * SKIA_IMAGE_TOOLBAR_ITEM_WIDTH +
            SKIA_IMAGE_TOOLBAR_ITEM_WIDTH / 2;
        const left = Math.max(8, Math.min(itemCenter - width / 2, layout.left + layout.width - width));
        const top = layout.top >= height + 6
            ? layout.top - height - 6
            : layout.top + layout.height + 6;
        this.fillPaint.setColor(this.canvasKit.parseColorString("#27272A"));
        canvas.drawRRect(this.canvasKit.RRectXY([left, top, left + width, top + height], 6, 6), this.fillPaint);
        const paragraph = this.fonts.createParagraph({
            text: label,
            color: "#FFFFFF",
            fontFamily: "Inter",
            fontSize: 11,
            lineHeight: 16,
            fontWeight: 500,
            letterSpacing: 0,
            align: "center",
            direction: "ltr",
            maxLines: 1,
        }, width);
        if (!paragraph)
            return;
        try {
            canvas.drawParagraph(paragraph, left, top + 4);
        }
        finally {
            paragraph.delete();
        }
    }
    dispose() {
        this.fillPaint.delete();
        this.strokePaint.delete();
    }
}
//# sourceMappingURL=skia-image-toolbar-painter.js.map