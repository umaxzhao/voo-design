import { AI_NODE_LAYOUT } from "../ai-node-layout.js";
import { formatModelDisplayName } from "../model-display.js";
import { isRunnableNodeType } from "../pipeline-hotkeys.js";
const CONTROL_HEIGHT = 28;
const RUN_SIZE = 32;
const FOOTER_INSET = 12;
const CONTROL_GAP = 6;
const CHIP_TEXT_SIZE = 11;
const CHIP_PADDING = 9;
const CHEVRON_WIDTH = 12;
const MIN_CHIP_WIDTH = 42;
const MAX_MODEL_WIDTH = 156;
const DROPDOWN_OPTION_HEIGHT = 26;
const DROPDOWN_PADDING = 6;
const DROPDOWN_MIN_WIDTH = 116;
const DROPDOWN_MAX_OPTIONS = 8;
/** Cards whose prompt body is painted and edited by Skia. */
const SKIA_PROMPT_NODE_TYPES = new Set([
    "prompt",
    "generator",
    "image-gen",
    "msgen",
    "video-gen",
    "design-gen",
    "llm",
    "text-gen",
]);
const MODEL_PICKER_NODE_TYPES = new Set([
    "llm",
    "text-gen",
    "generator",
    "image-gen",
    "msgen",
    "video-gen",
    "design-gen",
]);
const RATIO_PICKER_NODE_TYPES = new Set([
    "generator",
    "image-gen",
    "msgen",
    "video-gen",
]);
const AI_CONTROL_NODE_TYPES = new Set([
    "prompt",
    "llm",
    "text-gen",
    "generator",
    "image-gen",
    "msgen",
    "video-gen",
    "design-gen",
    "loop",
    "group",
    "gallery",
    "output",
]);
/** Empty-state label for the model chip. Reads as the action the user has to
 *  take — a bare "Model" looks like a field label, so an unconfigured node
 *  gave no hint that it was the reason Run wouldn't work. */
export const MODEL_PLACEHOLDER = "Set model";
export const AI_NODE_RATIO_OPTIONS = [
    { value: "auto", label: "Auto" },
    { value: "1:1", label: "1:1" },
    { value: "16:9", label: "16:9" },
    { value: "9:16", label: "9:16" },
    { value: "4:3", label: "4:3" },
    { value: "3:4", label: "3:4" },
];
export const AI_NODE_RESOLUTION_OPTIONS = [
    { value: "", label: "Res" },
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
    { value: "1440p", label: "1440p" },
    { value: "4K", label: "4K" },
];
const COLORS = {
    chip: "#F4F4F5",
    chipHover: "#E4E4E7",
    chipPressed: "#D4D4D8",
    chipActiveBorder: "#D4D4D8",
    chipText: "#52525B",
    placeholder: "#A1A1AA",
    run: "#18181B",
    runPressed: "#09090B",
    runActive: "#10B981",
    runDisabled: "#A1A1AA",
    runGlyph: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceBorder: "#E4E4E7",
    surfaceShadow: "#00000026",
    rowHover: "#F4F4F5",
    rowSelected: "#18181B",
    /** Semantic warning for a model no configured provider can serve. */
    unavailable: "#B45309",
};
const RESOLUTION_PATTERN = /^(\d+p|\d+k)$/i;
const RATIO_PATTERN = /^(\d+:\d+|auto|square|portrait|landscape|tall|classic)$/i;
/** True for AI creator cards whose whole surface Skia owns. */
export function isAiControlCard(element) {
    return (element.kind === "node" &&
        element.shape === "card" &&
        !element.nodeType.startsWith("plugin:") &&
        AI_CONTROL_NODE_TYPES.has(element.nodeType));
}
/**
 * Recovers the model / ratio / resolution strings the scene adapter packed into
 * `metadata` (in that order, dropping empty values) without needing new scene
 * fields. Entries are classified by shape so a missing model or ratio can never
 * shift the remaining values into the wrong control.
 */
export function resolveAiNodeControlValues(node) {
    const values = {};
    for (const entry of node.metadata ?? []) {
        const value = entry.trim();
        if (!value)
            continue;
        if (!values.resolution && RESOLUTION_PATTERN.test(value)) {
            values.resolution = value;
        }
        else if (!values.ratio && RATIO_PATTERN.test(value)) {
            values.ratio = value;
        }
        else if (!values.model) {
            // Display-only recovery: metadata packs the raw model id; chips show
            // the abbreviated form (`doubao-seedance-2-0-260128` → `seedance2.0`).
            values.model = formatModelDisplayName(value);
        }
    }
    return values;
}
export function aiNodeControlTarget(node) {
    return {
        nodeType: node.nodeType,
        width: node.bounds.width,
        height: node.bounds.height,
        ...resolveAiNodeControlValues(node),
    };
}
/**
 * Deterministic advance width estimate. Paragraph metrics are unavailable until
 * a font is registered, so control geometry must not depend on them — otherwise
 * hit-testing and painting could disagree on the very first frame.
 */
export function estimateControlTextWidth(text, fontSize) {
    let units = 0;
    for (const char of text) {
        units += char.codePointAt(0) > 0x2e80 ? 1 : 0.56;
    }
    return units * fontSize;
}
function chipWidth(label, max = MAX_MODEL_WIDTH) {
    const measured = estimateControlTextWidth(label, CHIP_TEXT_SIZE) +
        CHIP_PADDING * 2 +
        CHEVRON_WIDTH;
    return Math.round(Math.max(MIN_CHIP_WIDTH, Math.min(max, measured)));
}
export function layoutAiNodeControls(target) {
    const { contentInset, footerHeight } = AI_NODE_LAYOUT;
    const footerY = target.height - footerHeight;
    const controlY = footerY + Math.round((footerHeight - CONTROL_HEIGHT) / 2) + 4;
    const layout = {
        footerY,
        prompt: null,
        run: null,
        model: null,
        ratio: null,
        resolution: null,
    };
    // Controls right-align against the footer inset and may use the full footer
    // width (the DOM chip strip they once avoided no longer exists).
    let cursor = target.width - FOOTER_INSET;
    const minLeft = FOOTER_INSET;
    const place = (width) => {
        const x = cursor - width;
        if (x < minLeft)
            return null;
        cursor = x - CONTROL_GAP;
        return { x, y: controlY, width, height: CONTROL_HEIGHT };
    };
    if (isRunnableNodeType(target.nodeType)) {
        const x = cursor - RUN_SIZE;
        if (x >= minLeft) {
            layout.run = {
                x,
                y: footerY + Math.round((footerHeight - RUN_SIZE) / 2) + 2,
                width: RUN_SIZE,
                height: RUN_SIZE,
            };
            cursor = x - CONTROL_GAP;
        }
    }
    if (MODEL_PICKER_NODE_TYPES.has(target.nodeType)) {
        layout.model = place(chipWidth(target.model?.trim() || MODEL_PLACEHOLDER));
    }
    if (RATIO_PICKER_NODE_TYPES.has(target.nodeType)) {
        layout.resolution = place(chipWidth(target.resolution?.trim() || "Res", 84));
        layout.ratio = place(chipWidth(target.ratio?.trim() || "Auto", 84));
    }
    if (SKIA_PROMPT_NODE_TYPES.has(target.nodeType)) {
        // The painter draws card body text at contentInset + 8 (skia-scene-painter
        // drawText), so the hit rect starts there too — otherwise clicks in the
        // top 8px band of the painted text miss the prompt control.
        const top = contentInset + 8;
        const bottom = footerY - contentInset;
        const height = bottom - top;
        const width = target.width - contentInset * 2;
        if (height > 0 && width > 0) {
            layout.prompt = { x: contentInset, y: top, width, height };
        }
    }
    return layout;
}
function containsPoint(rect, x, y) {
    if (!rect)
        return false;
    return (x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height);
}
export function hitTestNodeControls(node, localX, localY) {
    if (!isAiControlCard(node))
        return null;
    const layout = layoutAiNodeControls(aiNodeControlTarget(node));
    const order = [
        "run",
        "model",
        "resolution",
        "ratio",
        "prompt",
    ];
    for (const controlId of order) {
        const bounds = layout[controlId];
        if (bounds && containsPoint(bounds, localX, localY))
            return { controlId, bounds };
    }
    return null;
}
export function layoutAiNodeDropdown(anchorInput, optionCount, cardWidth, requestedScrollOffset = 0, flipBelow = false) {
    const anchor = anchorInput ?? {
        x: 0,
        y: 0,
        width: DROPDOWN_MIN_WIDTH,
        height: CONTROL_HEIGHT,
    };
    const scrollOffset = Math.max(0, Math.min(requestedScrollOffset, Math.max(0, optionCount - DROPDOWN_MAX_OPTIONS)));
    const visibleCount = Math.max(1, Math.min(DROPDOWN_MAX_OPTIONS, optionCount - scrollOffset));
    const width = Math.max(DROPDOWN_MIN_WIDTH, anchor.width);
    const height = visibleCount * DROPDOWN_OPTION_HEIGHT + DROPDOWN_PADDING * 2;
    const x = Math.max(4, Math.min(anchor.x, cardWidth - width - 4));
    // The popover opens above its anchor by default; the host flips it below
    // when the anchor sits too close to the viewport top.
    const y = flipBelow
        ? anchor.y + anchor.height + CONTROL_GAP
        : anchor.y - CONTROL_GAP - height;
    const options = [];
    for (let index = 0; index < visibleCount; index += 1) {
        options.push({
            x: x + DROPDOWN_PADDING,
            y: y + DROPDOWN_PADDING + index * DROPDOWN_OPTION_HEIGHT,
            width: width - DROPDOWN_PADDING * 2,
            height: DROPDOWN_OPTION_HEIGHT,
        });
    }
    return { bounds: { x, y, width, height }, options, visibleCount, scrollOffset };
}
/**
 * Absolute option index under the pointer, `-1` for the popover chrome (a click
 * there is swallowed rather than treated as "outside"), or `null` when the
 * pointer is not over the popover at all.
 */
export function hitTestAiNodeDropdown(layout, localX, localY) {
    if (!containsPoint(layout.bounds, localX, localY))
        return null;
    const index = layout.options.findIndex((rect) => containsPoint(rect, localX, localY));
    return index < 0 ? -1 : layout.scrollOffset + index;
}
/** Max scroll offset for a list, so callers can clamp wheel deltas. */
export function maxAiNodeDropdownScroll(optionCount) {
    return Math.max(0, optionCount - DROPDOWN_MAX_OPTIONS);
}
/**
 * Screen-space flip test: the popover opens above its anchor unless the
 * anchor is too close to the viewport top to fit the popover there.
 * `anchorScreenTop` is the anchor's top edge in canvas screen pixels.
 */
export function aiNodeDropdownFlipsBelow(anchorScreenTop, dropdownHeight, zoom) {
    return anchorScreenTop < (dropdownHeight + CONTROL_GAP) * zoom;
}
/**
 * Keyboard navigation for an open dropdown (Escape / Enter / ArrowUp /
 * ArrowDown). Highlight stops at both ends; scrolling follows the highlight
 * so a long list keeps the active row visible.
 */
export function resolveAiNodeDropdownKey(state, key) {
    if (key === "Escape")
        return { type: "close" };
    if (key === "Enter")
        return { type: "commit", index: state.highlightedIndex };
    if (key !== "ArrowDown" && key !== "ArrowUp")
        return { type: "ignore" };
    const lastIndex = state.options.length - 1;
    if (lastIndex < 0)
        return { type: "ignore" };
    const index = Math.max(0, Math.min(lastIndex, state.highlightedIndex + (key === "ArrowDown" ? 1 : -1)));
    const visibleCount = Math.max(1, Math.min(DROPDOWN_MAX_OPTIONS, state.options.length));
    let scrollOffset = state.scrollOffset;
    if (index < scrollOffset)
        scrollOffset = index;
    else if (index >= scrollOffset + visibleCount) {
        scrollOffset = index - visibleCount + 1;
    }
    if (index === state.highlightedIndex && scrollOffset === state.scrollOffset) {
        return { type: "ignore" };
    }
    return { type: "highlight", index, scrollOffset };
}
let hoverState = null;
let pressedState = null;
let dropdownState = null;
export function getAiNodeControlHover() {
    return hoverState;
}
/** Returns true when the hover actually changed, so callers can skip repaints. */
export function setAiNodeControlHover(next) {
    if (hoverState?.nodeId === next?.nodeId &&
        hoverState?.controlId === next?.controlId) {
        return false;
    }
    hoverState = next;
    return true;
}
export function getAiNodeControlPressed() {
    return pressedState;
}
/** Same change-detection contract as setAiNodeControlHover. */
export function setAiNodeControlPressed(next) {
    if (pressedState?.nodeId === next?.nodeId &&
        pressedState?.controlId === next?.controlId) {
        return false;
    }
    pressedState = next;
    return true;
}
export function getAiNodeDropdown() {
    return dropdownState;
}
export function setAiNodeDropdown(next) {
    dropdownState = next;
}
export function resetAiNodeControlState() {
    hoverState = null;
    pressedState = null;
    dropdownState = null;
}
// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------
function fillRRect(canvasKit, canvas, paint, rect, radius, color) {
    paint.setAntiAlias(true);
    paint.setStyle(canvasKit.PaintStyle.Fill);
    paint.setColor(canvasKit.parseColorString(color));
    paint.setAlphaf(1);
    canvas.drawRRect(canvasKit.RRectXY([rect.x, rect.y, rect.x + rect.width, rect.y + rect.height], radius, radius), paint);
}
function strokeRRect(canvasKit, canvas, paint, rect, radius, color) {
    paint.setAntiAlias(true);
    paint.setStyle(canvasKit.PaintStyle.Stroke);
    paint.setStrokeWidth(1);
    paint.setColor(canvasKit.parseColorString(color));
    paint.setAlphaf(1);
    canvas.drawRRect(canvasKit.RRectXY([rect.x + 0.5, rect.y + 0.5, rect.x + rect.width - 0.5, rect.y + rect.height - 0.5], radius, radius), paint);
    paint.setStyle(canvasKit.PaintStyle.Fill);
}
function drawPath(canvasKit, canvas, paint, points) {
    const builder = new canvasKit.PathBuilder();
    points.forEach(([x, y], index) => {
        if (index === 0)
            builder.moveTo(x, y);
        else
            builder.lineTo(x, y);
    });
    builder.close();
    const path = builder.detach();
    builder.delete();
    try {
        canvas.drawPath(path, paint);
    }
    finally {
        path.delete();
    }
}
function drawLabel(fonts, canvas, text, color, rect, options = {}) {
    if (!text)
        return;
    const fontSize = options.fontSize ?? CHIP_TEXT_SIZE;
    const lineHeight = options.lineHeight ?? fontSize + 4;
    const paragraph = fonts.createParagraph({
        text,
        color,
        fontFamily: "Inter",
        fontSize,
        fontWeight: options.fontWeight ?? 500,
        lineHeight,
        letterSpacing: 0,
        align: options.align ?? "left",
        direction: "ltr",
        maxLines: options.maxLines,
        ellipsis: options.maxLines ? "…" : undefined,
    }, Math.max(1, rect.width));
    if (!paragraph)
        return;
    try {
        canvas.drawParagraph(paragraph, rect.x, rect.y);
    }
    finally {
        paragraph.delete();
    }
}
function drawChip(canvasKit, canvas, fonts, paint, rect, label, visual) {
    fillRRect(canvasKit, canvas, paint, rect, 8, visual === "pressed"
        ? COLORS.chipPressed
        : visual === "idle"
            ? COLORS.chip
            : COLORS.chipHover);
    if (visual === "active") {
        strokeRRect(canvasKit, canvas, paint, rect, 8, COLORS.chipActiveBorder);
    }
    drawLabel(fonts, canvas, label, COLORS.chipText, {
        x: rect.x + CHIP_PADDING,
        y: rect.y + 6,
        width: Math.max(1, rect.width - CHIP_PADDING - CHEVRON_WIDTH - 4),
        height: rect.height,
    }, { maxLines: 1 });
    paint.setColor(canvasKit.parseColorString(COLORS.chipText));
    paint.setStyle(canvasKit.PaintStyle.Fill);
    const cx = rect.x + rect.width - CHIP_PADDING - 3;
    const cy = rect.y + rect.height / 2;
    drawPath(canvasKit, canvas, paint, [
        [cx - 4, cy - 2],
        [cx + 4, cy - 2],
        [cx, cy + 3],
    ]);
}
function drawRunButton(canvasKit, canvas, paint, rect, node, hovered, pressed) {
    const running = node.status === "RUNNING";
    // A blocked node still accepts the click — the handler answers with the
    // specific reason (ai-node-preflight). Muting the button is what makes the
    // card admit up front that pressing it will not generate anything, so the
    // fill ignores hover/press: those would read as "armed and ready".
    const blocked = !running && node.runBlocked === true;
    const radius = rect.width / 2;
    paint.setAntiAlias(true);
    paint.setStyle(canvasKit.PaintStyle.Fill);
    paint.setAlphaf(1);
    paint.setColor(canvasKit.parseColorString(running
        ? COLORS.runActive
        : blocked
            ? COLORS.runDisabled
            : pressed
                ? COLORS.runPressed
                : hovered
                    ? COLORS.runDisabled
                    : COLORS.run));
    canvas.drawCircle(rect.x + radius, rect.y + radius, radius, paint);
    paint.setColor(canvasKit.parseColorString(COLORS.runGlyph));
    const cx = rect.x + radius;
    const cy = rect.y + radius;
    if (running) {
        // Square "stop" glyph — clicking a running node cancels the pipeline.
        canvas.drawRect([cx - 4, cy - 4, cx + 4, cy + 4], paint);
        return;
    }
    drawPath(canvasKit, canvas, paint, [
        [cx - 4, cy - 5],
        [cx - 4, cy + 5],
        [cx + 5, cy],
    ]);
}
function drawDropdown(canvasKit, canvas, fonts, paint, state) {
    const layout = layoutAiNodeDropdown(state.anchor, state.options.length, state.cardWidth, state.scrollOffset, state.flipBelow);
    // Popover shadow, same saveLayer + drop-shadow-only image filter pattern as
    // SkiaScenePainter.drawOuterShadows. Menu chrome is allowed a shadow per
    // AGENTS.md (canvas elements themselves stay flat).
    const shadowFilter = canvasKit.ImageFilter.MakeDropShadowOnly(0, 2, 4, 4, canvasKit.parseColorString(COLORS.surfaceShadow), null);
    paint.setImageFilter(shadowFilter);
    canvas.saveLayer(paint);
    paint.setImageFilter(null);
    try {
        fillRRect(canvasKit, canvas, paint, layout.bounds, 12, COLORS.surface);
    }
    finally {
        canvas.restore();
        shadowFilter.delete();
    }
    fillRRect(canvasKit, canvas, paint, layout.bounds, 12, COLORS.surface);
    strokeRRect(canvasKit, canvas, paint, layout.bounds, 12, COLORS.surfaceBorder);
    layout.options.forEach((rect, index) => {
        const optionIndex = layout.scrollOffset + index;
        const option = state.options[optionIndex];
        if (!option)
            return;
        const selected = option.value === state.value;
        if (optionIndex === state.highlightedIndex) {
            fillRRect(canvasKit, canvas, paint, rect, 6, COLORS.rowHover);
        }
        const labelColor = option.unavailable
            ? COLORS.unavailable
            : selected
                ? COLORS.rowSelected
                : COLORS.chipText;
        drawLabel(fonts, canvas, option.label, labelColor, { x: rect.x + 8, y: rect.y + 5, width: rect.width - 16, height: rect.height }, { maxLines: 1, fontWeight: selected ? 700 : 500 });
    });
    if (state.options.length > layout.visibleCount) {
        drawLabel(fonts, canvas, `${layout.scrollOffset + layout.visibleCount}/${state.options.length} · scroll`, COLORS.placeholder, {
            x: layout.bounds.x + 8,
            // The hint sits outside the popover on whichever side faces away
            // from the anchor chip.
            y: state.flipBelow
                ? layout.bounds.y - 16
                : layout.bounds.y + layout.bounds.height + 2,
            width: layout.bounds.width - 16,
            height: 14,
        }, { fontSize: 9, maxLines: 1 });
    }
}
export function aiNodePromptPlaceholder(nodeType) {
    switch (nodeType) {
        case "prompt":
            return "Enter prompt template...";
        case "generator":
        case "image-gen":
            return "Describe the image to generate...";
        case "msgen":
            return "Describe the 302 image generation prompt...";
        case "video-gen":
            return "Describe the video motion and concept...";
        case "design-gen":
            return "Describe the design to generate...";
        default:
            return "Enter details...";
    }
}
export function drawNodeControls(canvasKit, canvas, fonts, node, paint) {
    if (!isAiControlCard(node))
        return;
    const layout = layoutAiNodeControls(aiNodeControlTarget(node));
    const hover = getAiNodeControlHover()?.nodeId === node.id
        ? getAiNodeControlHover().controlId
        : null;
    const pressedState = getAiNodeControlPressed();
    const pressed = pressedState?.nodeId === node.id ? pressedState.controlId : null;
    const dropdown = getAiNodeDropdown();
    const activeControl = dropdown?.nodeId === node.id ? dropdown.controlId : null;
    const chipVisual = (controlId) => pressed === controlId
        ? "pressed"
        : activeControl === controlId
            ? "active"
            : hover === controlId
                ? "hovered"
                : "idle";
    const values = resolveAiNodeControlValues(node);
    // Prompt body text (and its native caret / selection while editing) is drawn
    // by SkiaScenePainter.drawText, which owns the paragraph layout. Only the
    // empty-state placeholder belongs here, since drawText bails on empty text.
    if (layout.prompt && !node.text?.trim()) {
        drawLabel(fonts, canvas, aiNodePromptPlaceholder(node.nodeType), COLORS.placeholder, { ...layout.prompt, height: 20 }, { fontSize: 13, fontWeight: 500, lineHeight: 20, maxLines: 1 });
    }
    if (layout.ratio) {
        drawChip(canvasKit, canvas, fonts, paint, layout.ratio, values.ratio?.trim() || "Auto", chipVisual("ratio"));
    }
    if (layout.resolution) {
        drawChip(canvasKit, canvas, fonts, paint, layout.resolution, values.resolution?.trim() || "Res", chipVisual("resolution"));
    }
    if (layout.model) {
        drawChip(canvasKit, canvas, fonts, paint, layout.model, values.model?.trim() || MODEL_PLACEHOLDER, chipVisual("model"));
    }
    if (layout.run) {
        drawRunButton(canvasKit, canvas, paint, layout.run, node, hover === "run", pressed === "run");
    }
    if (dropdown?.nodeId === node.id) {
        drawDropdown(canvasKit, canvas, fonts, paint, dropdown);
    }
}
//# sourceMappingURL=skia-node-controls.js.map