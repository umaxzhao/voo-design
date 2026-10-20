/**
 * Where the design editor's floating panels sit, and what fitting the
 * artboard must leave clear for them (EDT-2, EDT-3).
 *
 * Layers, Properties and History are w-64 cards 16px in from the stage edge
 * (left-4 / right-4), vertically centred over the stage. The add-canvas
 * button sits 24px right of the artboard and is 36px wide.
 *
 * A fit to the whole stage put a 1024×768 picture under both panels: beside a
 * docked Agent the editor is 798px wide at 1440×900, and the two panels left
 * about 250px of it clear, with the add-canvas button cut in half by the
 * stage edge. A wide stage now keeps both panel sides clear. A narrow one
 * shows a single panel at a time, in one column on the Layers side, so the
 * artboard keeps a usable width.
 */

import { fitScale } from "../editor/editor_constants.js";

/** Stage edge + panel + gap to the artboard. */
export const EDITOR_PANEL_INSET = 16 + 256 + 12;

/** Gap + add-canvas button + gap, right of the artboard. */
export const ADD_CANVAS_ALLOWANCE = 24 + 36 + 12;

/** The narrowest artboard area a two-panel layout may leave. */
export const MIN_WIDE_ARTBOARD = 480;

/** The tool bar (top-[14px], 48px tall) and a gap. */
export const EDITOR_TOOLBAR_INSET = 14 + 48 + 10;

/**
 * The page header row (index + title + canvas-type switch) that sits above the
 * artboard's top-left corner: the row's own height (the compact canvas-type
 * segment is the tallest thing in it, ~22px) plus a clear gap under it. The
 * free-canvas title uses this too, so neither layout lets the row spill onto
 * the artboard.
 */
export const EDITOR_PAGE_HEADER_INSET = 20;

/**
 * Clear space between the page header row and the page tool row (contextual
 * task bar + delete) that floats one row above it.
 */
export const EDITOR_PAGE_TOOLBAR_GAP = 6;

/** The zoom bar (bottom-5, 36px tall) and a gap. */
export const EDITOR_ZOOM_INSET = 20 + 36 + 8;

const STAGE_EDGE = 16;

/** Matches the md rail width: below this Layers stretches across the stage. */
const SCENE_RAIL_MIN_WIDTH = 768;

/**
 * @param {{ stageWidth: number, swapped?: boolean, panelWide?: boolean, reserveBothPanels?: boolean }} options
 *   `swapped` puts Layers on the right (the panels' side toggle).
 *   `panelWide` uses the rendered editor's width classification when the
 *   measured engine stage has a different width.
 *   `reserveBothPanels` keeps both side bands clear when both panels are shown
 *   in a narrow editor.
 * @returns {{ wide: boolean, insets: { left: number, right: number, top: number, bottom: number } }}
 *   `wide`: both panel columns fit at this width. It remains false when the
 *   caller reserves both panels explicitly in a narrower stage.
 *   Top and bottom keep the page's edges, its header row and a crop frame's
 *   corner handles out from under the tool bar and the zoom bar.
 */
export function editorPanelLayout({
  stageWidth,
  swapped = false,
  panelWide,
  reserveBothPanels = false,
}) {
  const width = Number(stageWidth) || 0;
  const wide =
    panelWide ??
    width - EDITOR_PANEL_INSET * 2 - ADD_CANVAS_ALLOWANCE >= MIN_WIDE_ARTBOARD;
  const vertical = {
    top: EDITOR_TOOLBAR_INSET + EDITOR_PAGE_HEADER_INSET,
    bottom: EDITOR_ZOOM_INSET,
  };
  if (wide || reserveBothPanels) {
    return {
      wide,
      insets: {
        left: EDITOR_PANEL_INSET,
        right: EDITOR_PANEL_INSET + ADD_CANVAS_ALLOWANCE,
        ...vertical,
      },
    };
  }
  return {
    wide,
    insets: swapped
      ? {
          left: STAGE_EDGE,
          right: EDITOR_PANEL_INSET + ADD_CANVAS_ALLOWANCE,
          ...vertical,
        }
      : {
          left: EDITOR_PANEL_INSET,
          right: ADD_CANVAS_ALLOWANCE,
          ...vertical,
        },
  };
}

/** Resolve the panels that are actually rendered for the editor state. */
export function editorPanelVisibility({
  multi,
  wide,
  wideLayersRail,
  sceneInspector = false,
  editorWidth,
  propertiesOpen,
  historyOpen,
}) {
  const singlePanelColumn = !multi && !wide;
  const layersPanelShown =
    (wideLayersRail &&
      editorWidth >= (sceneInspector ? SCENE_RAIL_MIN_WIDTH : 600)) ||
    !singlePanelColumn ||
    (!propertiesOpen && !historyOpen);
  return { singlePanelColumn, layersPanelShown };
}

/** Whether the rendered Layers and inspector/history panels occupy both sides. */
export function shouldReserveBothPanelInsets({
  layersPanelShown,
  propertiesOpen,
  historyOpen,
}) {
  return Boolean(layersPanelShown && (propertiesOpen || historyOpen));
}

/**
 * Bottom inset for fit camera when motion timeline is open.
 * Adds timeline height (fallback 220) + 24 margin if open, otherwise leaves insets unchanged.
 *
 * @param {{ left?: number, right?: number, top?: number, bottom?: number }} [baseInsets]
 * @param {{ motionOpen?: boolean, motionTimelineHeight?: number }} [options]
 * @returns {{ left?: number, right?: number, top?: number, bottom: number }}
 */
export function calculateFitInsets(
  baseInsets,
  { motionOpen, motionTimelineHeight } = {},
) {
  const insets = baseInsets || {};
  return {
    ...insets,
    bottom:
      (insets.bottom ?? 0) +
      (motionOpen ? (motionTimelineHeight || 220) + 24 : 0),
  };
}

/** Fit one page around the side panels and Motion timeline actually shown. */
export function editorPageFitInsets({
  stageWidth,
  swapped = false,
  panelWide,
  layersPanelShown = false,
  propertiesOpen = false,
  historyOpen = false,
  motionOpen = false,
  motionTimelineHeight,
}) {
  const panel = editorPanelLayout({
    stageWidth,
    swapped,
    panelWide,
    reserveBothPanels: shouldReserveBothPanelInsets({
      layersPanelShown,
      propertiesOpen,
      historyOpen,
    }),
  });
  return calculateFitInsets(panel.insets, {
    motionOpen,
    motionTimelineHeight,
  });
}

/** Fit one artboard inside the stage area left clear by the editor panels. */
export function fitEditorPageCamera({
  stageWidth,
  stageHeight,
  layout,
  insets,
}) {
  if (!layout || stageWidth <= 0 || stageHeight <= 0) return null;
  const left = Math.max(0, insets?.left ?? 0);
  const right = Math.max(0, insets?.right ?? 0);
  const top = Math.max(0, insets?.top ?? 0);
  const bottom = Math.max(0, insets?.bottom ?? 0);
  const usableWidth = stageWidth - left - right;
  const usableHeight = stageHeight - top - bottom;
  const x = usableWidth >= 120 ? left : 0;
  const y = usableHeight >= 120 ? top : 0;
  const width = usableWidth >= 120 ? usableWidth : stageWidth;
  const height = usableHeight >= 120 ? usableHeight : stageHeight;
  const zoom = fitScale(width, height, layout.width, layout.height);
  return {
    zoom,
    panX: x + (width - layout.width * zoom) / 2 - layout.x * zoom,
    panY: y + (height - layout.height * zoom) / 2 - layout.y * zoom,
  };
}
