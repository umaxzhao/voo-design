import { TOOL, TOOL_KEYS, TOOL_SHIFT_KEYS, toggleToolKey } from './editor/editor_constants.js';
import { marqueeItemForMode, MARQUEE_MODE_IDS } from './editor/tool_families.js';
import { resolveToolFamilyKeyAction } from './editor-shortcut-actions.js';
/** Return true when this ordered shortcut stage owns the event. */
export function handleToolShortcut(event, context) {
  const { engine, toolRef, opacityDigitTimerRef, pressedFamilyCodeRef, mousePosRef, lastToolRef, onTool, onSwapColors, currentCanvasType, isTimelineTarget, isThreeD, onOpenPieMenu } = context;
  if (event.altKey) return true;

  // Grouped tool modes: Cmd/Ctrl+1..7
  if ((event.ctrlKey || event.metaKey) && /^Digit[1-7]$/.test(event.code)) {
    const slot = Number(event.code.slice(-1));
    const activeTool = toolRef.current;
    const transformModes = [
      TOOL.DISTORT,
      TOOL.PERSPECTIVE,
      TOOL.PUPPET_WARP,
    ];
    const brushModes = [
      "normal",
      "smudge",
      "blur",
      "sharpen",
      "dodge",
      "burn",
      "sponge",
    ];
    if (
      activeTool === TOOL.PERSPECTIVE ||
      activeTool === TOOL.DISTORT ||
      activeTool === TOOL.PUPPET_WARP
    ) {
      const mode = transformModes[slot - 1];
      if (mode) {
        event.preventDefault();
        onTool(mode);
        return true;
      }
    }
    if (
      activeTool === TOOL.MARQUEE ||
      activeTool === TOOL.LASSO ||
      activeTool === TOOL.WAND ||
      activeTool === TOOL.REGION
    ) {
      const item = marqueeItemForMode(MARQUEE_MODE_IDS[slot - 1]);
      if (item) {
        event.preventDefault();
        if (item.toolId === TOOL.MARQUEE) engine.setMarqueeMode?.(item.id);
        onTool(item.toolId);
        return true;
      }
    }
    if (activeTool === TOOL.BRUSH) {
      const mode = brushModes[slot - 1];
      if (mode) {
        event.preventDefault();
        engine.setBrushMode?.(mode);
        return true;
      }
    }
  }

  // Cmd/Ctrl + Quote toggles the grid (Affinity / Figma).
  if (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    (event.code === "Quote" || event.key === "'")
  ) {
    event.preventDefault();
    const currentGrid = engine.getGrid?.();
    const gridEnabled = currentGrid && currentGrid?.enabled !== false;
    engine.setGrid?.({
      ...currentGrid,
      enabled: !gridEnabled,
      size: currentGrid?.size ?? 32,
    });
    return true;
  }

  // Shift + Cmd/Ctrl + Semicolon or Quote toggles smart snapping.
  if (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    (event.code === "Semicolon" ||
      event.code === "Quote" ||
      event.key === ";" ||
      event.key === "'")
  ) {
    event.preventDefault();
    engine.toggleSnapping?.();
    return true;
  }

  if (event.metaKey || event.ctrlKey) return true;

  // Photoshop-style number keys for opacity
  const isDigit = /^Digit([0-9])$/.exec(event.code);
  const isNumpad = /^Numpad([0-9])$/.exec(event.code);
  const digitMatch = isDigit || isNumpad;
  if (digitMatch && !event.shiftKey) {
    const brushArmed = toolRef.current === TOOL.BRUSH;
    const selected = engine.getSelected();
    if (brushArmed || (selected && !selected.locked)) {
      event.preventDefault();
      const digit = parseInt(digitMatch[1], 10);
      const now = Date.now();
      let targetPct = 100;
      if (
        now - opacityDigitTimerRef.current.time < 800 &&
        opacityDigitTimerRef.current.firstDigit !== null
      ) {
        targetPct = opacityDigitTimerRef.current.firstDigit * 10 + digit;
        opacityDigitTimerRef.current = { time: 0, firstDigit: null };
      } else {
        targetPct = digit === 0 ? 100 : digit * 10;
        opacityDigitTimerRef.current = { time: now, firstDigit: digit };
      }
      const nextOpacity = Math.max(0, Math.min(1, targetPct / 100));
      if (brushArmed) engine.setBrushOpacity?.(nextOpacity);
      else engine.updateNode(selected.id, { opacity: nextOpacity });
      return true;
    }
  }

  // X swaps colors
  if (
    event.code === "KeyX" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    if (onSwapColors) {
      event.preventDefault();
      onSwapColors();
      return true;
    }
  }

  // S arms clone stamp (2D canvas only)
  if (
    event.code === "KeyS" &&
    !isTimelineTarget &&
    !isThreeD &&
    currentCanvasType !== "motion"
  ) {
    event.preventDefault();
    engine.setHealingMode?.("clone");
    onTool(TOOL.HEALING);
    return true;
  }

  // 2D drawing tool keys and tool families do not fire in 3D canvas mode
  if (isThreeD) {
    return true;
  }

  // Shifted tool keys and geometry actions
  if (event.shiftKey) {
    if (event.code === "KeyA") {
      event.preventDefault();
      void engine.toggleAutoLayoutSelection?.();
      return true;
    }
    if (event.code === "KeyH") {
      event.preventDefault();
      void engine.flipHorizontal?.();
      return true;
    }
    if (event.code === "KeyV") {
      event.preventDefault();
      void engine.flipVertical?.();
      return true;
    }
    const shiftedTool = TOOL_SHIFT_KEYS[event.code];
    if (shiftedTool) {
      event.preventDefault();
      onTool(shiftedTool);
      return true;
    }
  }

  // A tool-family key opens the Pie Menu immediately. This branch must
  // stay before TOOL_KEYS so the family key never falls through to a
  // single-tool switch while the radial is meant to show.
  const familyKeyAction = resolveToolFamilyKeyAction({
    phase: "keydown",
    code: event.code,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    repeat: Boolean(event.repeat),
    pressedCode: pressedFamilyCodeRef.current,
  });
  if (familyKeyAction) {
    event.preventDefault();
    if (familyKeyAction.type === "openPie") {
      pressedFamilyCodeRef.current = event.code;
      onOpenPieMenu?.(
        familyKeyAction.family,
        mousePosRef.current,
        event.code,
      );
    }
    // familyHold (OS auto-repeat while the same key is held) is a no-op:
    // the menu is already open and must not reopen on every repeat.
    return true;
  }

  const nextTool = TOOL_KEYS[event.code];
  if (nextTool) {
    event.preventDefault();
    const toggled = toggleToolKey(
      toolRef.current,
      nextTool,
      lastToolRef.current,
    );
    lastToolRef.current = toggled.lastTool;
    onTool(toggled.tool);
  }

  return false;
}
