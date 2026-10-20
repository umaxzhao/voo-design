import { layoutSkiaContextMenu, } from "./skia-context-menu.js";
const MENU_RADIUS = 12;
const LABEL_LEFT = 14;
const LABEL_TOP_OFFSET = 8;
export class SkiaContextMenuPainter {
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
    draw(canvas, menu, viewport) {
        const layout = layoutSkiaContextMenu(menu, viewport);
        this.fillPaint.setColor(this.canvasKit.parseColorString("#FFFFFF"));
        canvas.drawRRect(this.canvasKit.RRectXY([
            layout.left,
            layout.top,
            layout.left + layout.width,
            layout.top + layout.height,
        ], MENU_RADIUS, MENU_RADIUS), this.fillPaint);
        this.strokePaint.setColor(this.canvasKit.parseColorString("#E5E7EB"));
        canvas.drawRRect(this.canvasKit.RRectXY([
            layout.left + 0.5,
            layout.top + 0.5,
            layout.left + layout.width - 0.5,
            layout.top + layout.height - 0.5,
        ], MENU_RADIUS, MENU_RADIUS), this.strokePaint);
        for (const row of layout.rows) {
            if (row.item.separatorBefore) {
                this.fillPaint.setColor(this.canvasKit.parseColorString("#F3F4F6"));
                canvas.drawRect([
                    layout.left + 8,
                    row.top - 1,
                    layout.left + layout.width - 8,
                    row.top,
                ], this.fillPaint);
            }
            if (row.itemIndex === menu.highlightedIndex && !row.item.disabled) {
                this.fillPaint.setColor(this.canvasKit.parseColorString("#F3F4F6"));
                canvas.drawRRect(this.canvasKit.RRectXY([
                    layout.left + 5,
                    row.top + 2,
                    layout.left + layout.width - 5,
                    row.bottom - 2,
                ], 7, 7), this.fillPaint);
            }
            this.drawLabel(canvas, layout.left, layout.width, row);
        }
    }
    dispose() {
        this.fillPaint.delete();
        this.strokePaint.delete();
    }
    drawLabel(canvas, left, width, row) {
        const color = row.item.disabled
            ? "#9CA3AF"
            : row.item.tone === "danger"
                ? "#E11D48"
                : row.item.tone === "warning"
                    ? "#D97706"
                    : "#374151";
        const paragraph = this.fonts.createParagraph({
            text: row.item.label,
            color,
            fontFamily: "Inter",
            fontSize: 12,
            lineHeight: 16,
            fontWeight: 500,
            letterSpacing: 0,
            align: "left",
            direction: "ltr",
            maxLines: 1,
            ellipsis: "…",
        }, width - LABEL_LEFT * 2 - (row.item.secondaryLabel ? 42 : 0));
        if (paragraph) {
            try {
                canvas.drawParagraph(paragraph, left + LABEL_LEFT, row.top + (row.item.description ? 5 : LABEL_TOP_OFFSET));
            }
            finally {
                paragraph.delete();
            }
        }
        if (row.item.description) {
            const description = this.fonts.createParagraph({
                text: row.item.description,
                color: row.item.disabled ? "#D1D5DB" : "#9CA3AF",
                fontFamily: "Inter",
                fontSize: 10,
                lineHeight: 14,
                fontWeight: 400,
                letterSpacing: 0,
                align: "left",
                direction: "ltr",
                maxLines: 1,
                ellipsis: "…",
            }, width - LABEL_LEFT * 2);
            if (description) {
                try {
                    canvas.drawParagraph(description, left + LABEL_LEFT, row.top + 24);
                }
                finally {
                    description.delete();
                }
            }
        }
        if (!row.item.secondaryLabel)
            return;
        const secondary = this.fonts.createParagraph({
            text: row.item.secondaryLabel,
            color: "#9CA3AF",
            fontFamily: "Inter",
            fontSize: 10,
            lineHeight: 14,
            fontWeight: 500,
            letterSpacing: 0,
            align: "right",
            direction: "ltr",
            maxLines: 1,
        }, 38);
        if (!secondary)
            return;
        try {
            canvas.drawParagraph(secondary, left + width - 52, row.top + 9);
        }
        finally {
            secondary.delete();
        }
    }
}
//# sourceMappingURL=skia-context-menu-painter.js.map