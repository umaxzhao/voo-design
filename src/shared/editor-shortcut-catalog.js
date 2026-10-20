/**
 * Pure shortcut-reference catalog for the Design/Image editor.
 *
 * This module is deliberately free of React and DOM. The cheat-sheet shell
 * only maps these groups; the same history rows are reused by both editor
 * catalogs so their user-visible shortcut documentation cannot drift apart
 * from the shared history pipeline.
 */
import { HISTORY_SHORTCUT_ACTION } from "./editor-shortcut-pipeline.js";

/** Shared history rows, keyed by the same action ids the pipeline returns. */
export const HISTORY_SHORTCUT_ROWS = Object.freeze({
  [HISTORY_SHORTCUT_ACTION.UNDO]: Object.freeze({
    id: HISTORY_SHORTCUT_ACTION.UNDO,
    key: "⌘Z",
    labelKey: "editor.undo",
  }),
  [HISTORY_SHORTCUT_ACTION.REDO]: Object.freeze({
    id: HISTORY_SHORTCUT_ACTION.REDO,
    key: "⇧⌘Z / ⌘Y",
    labelKey: "editor.redo",
  }),
});

/** Design/Image editor shortcut groups. */
export const DESIGN_SHORTCUT_GROUPS = Object.freeze([
  Object.freeze({
    id: "tools",
    titleKey: "editor.shortcuts.group.tools",
    shortcuts: Object.freeze([
      Object.freeze({ key: "V / A", labelKey: "editor.tool.select" }),
      Object.freeze({ key: "⌘T / Q", labelKey: "editor.tool.transform" }),
      Object.freeze({ key: "M", labelKey: "editor.tool.region" }),
      Object.freeze({ key: "M", labelKey: "editor.tool.marquee" }),
      Object.freeze({ key: "W", labelKey: "editor.tool.wand" }),
      Object.freeze({ key: "L", labelKey: "editor.tool.lasso" }),
      Object.freeze({ key: "B", labelKey: "editor.tool.brush" }),
      Object.freeze({ key: "E", labelKey: "editor.tool.eraser" }),
      Object.freeze({ key: "J / S", labelKey: "editor.tool.healing" }),
      Object.freeze({ key: "R", labelKey: "editor.tool.rect" }),
      Object.freeze({ key: "O", labelKey: "editor.tool.ellipse" }),
      Object.freeze({ key: "⇧L", labelKey: "editor.tool.arrow" }),
      Object.freeze({ key: "P", labelKey: "editor.tool.pen" }),
      Object.freeze({ key: "⇧P", labelKey: "editor.tool.freePen" }),
      Object.freeze({ key: "T", labelKey: "editor.tool.text" }),
      Object.freeze({ key: "C", labelKey: "editor.tool.crop" }),
      Object.freeze({ key: "I", labelKey: "editor.tool.dropper" }),
      Object.freeze({ key: "G", labelKey: "editor.tool.fill" }),
      Object.freeze({ key: "G", labelKey: "editor.tool.gradient" }),
    ]),
  }),
  Object.freeze({
    id: "edit",
    titleKey: "editor.shortcuts.group.edit",
    shortcuts: Object.freeze([
      HISTORY_SHORTCUT_ROWS[HISTORY_SHORTCUT_ACTION.UNDO],
      HISTORY_SHORTCUT_ROWS[HISTORY_SHORTCUT_ACTION.REDO],
      Object.freeze({ key: "⌘C", labelKey: "editor.shortcut.copy" }),
      Object.freeze({ key: "⌘V", labelKey: "editor.shortcut.paste" }),
      Object.freeze({ key: "⌘D", labelKey: "editor.menu.duplicate" }),
      Object.freeze({ key: "⌘X", labelKey: "editor.menu.cut" }),
      Object.freeze({ key: "X", labelKey: "editor.shortcut.swapColors" }),
      Object.freeze({ key: "⌘\\", labelKey: "editor.shortcut.fillForeground" }),
      Object.freeze({ key: "⌥\\", labelKey: "editor.shortcut.fillBackground" }),
      Object.freeze({ key: "⌘J", labelKey: "editor.menu.layerFromSelection" }),
      Object.freeze({ key: "⇧⌘I", labelKey: "editor.mask.invert" }),
      Object.freeze({ key: "⇧⌘O", labelKey: "editor.menu.convertToPath" }),
      Object.freeze({ key: "⌘G", labelKey: "editor.menu.group" }),
      Object.freeze({ key: "⇧⌘G", labelKey: "editor.menu.ungroup" }),
      Object.freeze({ key: "⌥⌘G", labelKey: "editor.menu.createClipMask" }),
      Object.freeze({ key: "⇧⌥⌘G", labelKey: "editor.menu.releaseClipMask" }),
      Object.freeze({ key: "]", labelKey: "editor.shortcut.bringForward" }),
      Object.freeze({ key: "[", labelKey: "editor.shortcut.sendBackward" }),
      Object.freeze({ key: "⌘]", labelKey: "editor.shortcut.toFront" }),
      Object.freeze({ key: "⌘[", labelKey: "editor.shortcut.toBack" }),
      Object.freeze({ key: "Delete / ⌫", labelKey: "editor.menu.delete" }),
      Object.freeze({ key: "⌘/Ctrl+A", labelKey: "editor.menu.selectAll" }),
      Object.freeze({ key: "⌘S", labelKey: "editor.shortcut.apply" }),
      Object.freeze({ key: "Tab", labelKey: "editor.shortcut.saveAndExit" }),
      Object.freeze({ key: "↑↓←→", labelKey: "editor.shortcut.nudge" }),
      Object.freeze({
        key: "1..9, 0",
        labelKey: "editor.shortcut.opacityDigits",
      }),
      Object.freeze({ key: "[ / ]", labelKey: "editor.shortcut.brushSize" }),
      Object.freeze({
        key: "⇧[ / ⇧]",
        labelKey: "editor.shortcut.brushHardness",
      }),
      Object.freeze({ key: "⌘1–7", labelKey: "editor.shortcut.toolMode" }),
    ]),
  }),
  Object.freeze({
    id: "view",
    titleKey: "editor.shortcuts.group.view",
    shortcuts: Object.freeze([
      Object.freeze({ key: "⌘+ / ⌘-", labelKey: "editor.zoomTitle" }),
      Object.freeze({ key: "⇧0 / ⌘0", labelKey: "editor.shortcut.zoom100" }),
      Object.freeze({ key: "⇧1", labelKey: "editor.zoomFit" }),
      Object.freeze({ key: "\\", labelKey: "editor.compareOriginal" }),
      Object.freeze({ key: "Space + Drag", labelKey: "editor.panCanvas" }),
      Object.freeze({ key: "?", labelKey: "editor.shortcuts.title" }),
      Object.freeze({ key: "Esc", labelKey: "editor.cancel" }),
    ]),
  }),
]);

/** 3D scene editor shortcut groups. */
export const THREE_D_SHORTCUT_GROUPS = Object.freeze([
  Object.freeze({
    id: "three-tools",
    titleKey: "editor.shortcuts.group.tools",
    shortcuts: Object.freeze([
      Object.freeze({ key: "W / G", labelKey: "editor.three.moveTool" }),
      Object.freeze({ key: "E / R", labelKey: "editor.three.rotateTool" }),
      Object.freeze({ key: "S", labelKey: "editor.three.scaleTool" }),
    ]),
  }),
  Object.freeze({
    id: "three-view",
    titleKey: "editor.shortcuts.group.view",
    shortcuts: Object.freeze([
      Object.freeze({ key: "1 / 3 / 7", labelKey: "editor.three.viewPresets" }),
      Object.freeze({ key: "5", labelKey: "editor.three.toggleProjection" }),
      Object.freeze({ key: "Home", labelKey: "editor.three.frameScene" }),
      Object.freeze({ key: ". / F", labelKey: "editor.three.frameSelected" }),
      Object.freeze({ key: "Numpad 2/4/6/8", labelKey: "editor.three.orbitCamera" }),
    ]),
  }),
  Object.freeze({
    id: "three-edit",
    titleKey: "editor.shortcuts.group.edit",
    shortcuts: Object.freeze([
      HISTORY_SHORTCUT_ROWS[HISTORY_SHORTCUT_ACTION.UNDO],
      HISTORY_SHORTCUT_ROWS[HISTORY_SHORTCUT_ACTION.REDO],
      Object.freeze({ key: "Delete / ⌫", labelKey: "editor.menu.delete" }),
    ]),
  }),
]);

/** Motion timeline editor shortcut groups. */
export const MOTION_SHORTCUT_GROUPS = Object.freeze([
  Object.freeze({
    id: "motion-playback",
    titleKey: "editor.shortcuts.group.playback",
    shortcuts: Object.freeze([
      Object.freeze({ key: "Space", labelKey: "editor.motion.playPause" }),
      Object.freeze({ key: "Home / End", labelKey: "editor.motion.jumpStartEnd" }),
      Object.freeze({ key: "← / →", labelKey: "editor.motion.stepFrame" }),
      Object.freeze({ key: "⇧← / ⇧→", labelKey: "editor.motion.jumpSecond" }),
    ]),
  }),
  Object.freeze({
    id: "motion-edit",
    titleKey: "editor.shortcuts.group.edit",
    shortcuts: Object.freeze([
      HISTORY_SHORTCUT_ROWS[HISTORY_SHORTCUT_ACTION.UNDO],
      HISTORY_SHORTCUT_ROWS[HISTORY_SHORTCUT_ACTION.REDO],
      Object.freeze({ key: "S", labelKey: "editor.motion.splitClip" }),
      Object.freeze({ key: "Delete / ⌫", labelKey: "editor.motion.deleteClip" }),
    ]),
  }),
]);

/** Map of editor id → groups, so one shell can render either editor. */
export const SHORTCUT_GROUPS_BY_EDITOR = Object.freeze({
  design: DESIGN_SHORTCUT_GROUPS,
  "3d": THREE_D_SHORTCUT_GROUPS,
  motion: MOTION_SHORTCUT_GROUPS,
});

/** All shortcut groups for global reference (e.g. Settings). */
export const ALL_SHORTCUT_GROUPS = Object.freeze([
  ...DESIGN_SHORTCUT_GROUPS,
  ...THREE_D_SHORTCUT_GROUPS,
  ...MOTION_SHORTCUT_GROUPS,
]);

