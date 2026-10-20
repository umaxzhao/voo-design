import PropTypes from "prop-types";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  IconCheck,
  IconClose,
  IconCopy,
  IconFlipH,
  IconFlipV,
  IconFolder,
  IconLock,
  IconMask,
  IconMore,
  IconSliders,
  IconSwap,
  IconTrash,
  IconUnlock,
  IconVectorSquare,
  IconCode,
  IconDiamond,
  IconUnlink,
} from "../icons.jsx";
import { OperationIcon } from "./editor_properties/combine_section.jsx";
import { AlignIcon } from "./editor_properties/align_section.jsx";
import { alignNodes } from "../editor/align_ops.js";
import { BOOLEAN_OPERATIONS } from "../editor/scene_model.js";
import AddKindPicker from "./editor_properties/add_kind_picker.jsx";
import EditorTooltip from "./editor_tooltip.jsx";
import {
  EditorAiMenuSection,
  ICON_BTN,
  ICON_BTN_AI,
  ICON_BTN_DEFAULT,
} from "./editor_ai_taskbar_buttons.jsx";
import EditorLocalRepaintButton from "./editor_local_repaint_button.jsx";
import { useI18n } from "../use_i18n.js";
import { TOOL } from "../editor/editor_constants.js";
import {
  EDITOR_PAGE_HEADER_INSET,
  EDITOR_PAGE_TOOLBAR_GAP,
} from "./editor_panel_layout.js";

/**
 * Adaptive Contextual Task Bar for Design Editor.
 *
 * Dynamically plans and adapts its tools based on current context:
 * 1. Pixel Selection: Repaint, Transform, Invert, Deselect.
 * 2. Multi-Shape / Vector Boolean: Union, Subtract, Intersect, Exclude + Align + Group + Delete.
 * 3. Multi-Layer Selection: Align Left, Center, Right, Top, Middle, Bottom + Group + Delete.
 * 4. Pen / Path Editing: Finish Path, Delete Anchor, Flip H, Flip V, Delete.
 * 5. Single Shape: Flip H, Flip V, Duplicate, Lock, Delete.
 * 6. Single Text: Duplicate, Lock, Delete.
 * 7. Single Image: Remove BG, Generative Fill, adjustments, More.
 *    More carries the image AI group: Expand, 2X/4X Upscale, Auto Enhance,
 *    Portrait Retouch, Split Layers.
 */
function EditorContextualTaskBar({
  engine,
  tool = null,
  selected = null,
  hasSelection = false,
  removeBackground,
  maskBusy = false,
  onRepaint,
  repaintBusy = false,
  onOutpaint = null,
  onUpscale = null,
  upscaleBusy = false,
  onAutoEnhance = null,
  onPortraitRetouch = null,
  portraitRetouchBusy = false,
  onSplitLayers = null,
  splitLayersBusy = false,
  onAddAdjustmentLayer,
  onApplyPreset,
  getBitmap,
  docRect = null,
  onEditSvg = null,
  onCreateComponent = null,
  onDetachInstance = null,
}) {
  const { t } = useI18n();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const barRef = useRef(null);
  const adjustRef = useRef(null);
  const moreRef = useRef(null);

  // Close menus on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        adjustRef.current &&
        !adjustRef.current.contains(event.target) &&
        !event.target.closest?.("[data-editor-adjustment-picker]")
      ) {
        setAdjustOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(event.target)) {
        setMoreOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setAdjustOpen(false);
        setMoreOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const isLocked = selected?.locked ?? false;

  const selectedIds =
    engine?.getSelectedIds?.() ?? (selected ? [selected.id] : []);
  const selectedCount = selectedIds.length;
  const isTransforming = Boolean(engine?.getSelectionTransform?.());
  const canCombine = engine?.canCombineSelection?.() ?? false;
  const isPenActive = tool === TOOL.PEN || Boolean(engine?.penEdit);
  const isShape =
    selected?.kind === "rect" ||
    selected?.kind === "ellipse" ||
    selected?.kind === "path" ||
    selected?.kind === "boolean";
  const isText = selected?.kind === "text";

  const dynamicStyle = useMemo(() => {
    if (!docRect) return null;
    return {
      left: `${docRect.x + docRect.width / 2}px`,
      // Above the page header row, not beside it: the header owns the
      // artboard's top-left, so the bar sits one row higher and never covers
      // the page. `-translate-y-full` lifts the bar its own height clear.
      top: `${docRect.y - EDITOR_PAGE_HEADER_INSET - EDITOR_PAGE_TOOLBAR_GAP}px`,
    };
  }, [docRect]);

  // When nothing is active, hide the taskbar
  if (
    !hasSelection &&
    !isTransforming &&
    selectedCount === 0 &&
    !selected &&
    !isPenActive
  ) {
    return null;
  }

  return (
    <nav
      ref={barRef}
      data-testid="editor-contextual-taskbar"
      aria-label={t("editor.taskbar.ariaLabel")}
      style={dynamicStyle ?? undefined}
      className={`pointer-events-auto z-20 flex items-center gap-1 rounded-xl border border-white/20 bg-neutral-900/95 p-1 shadow-pop backdrop-blur-md transition-all whitespace-nowrap font-mono text-[11px] text-neutral-200 select-none ${
        dynamicStyle
          ? "absolute -translate-x-1/2 -translate-y-full"
          : "relative"
      }`}
    >
      {/* 0. SELECTION TRANSFORM CONTEXT */}
      {isTransforming ? (
        <>
          {/* Apply Transform */}
          <EditorTooltip title={t("editor.selection.applyTransform")}>
            <button
              type="button"
              onClick={() => engine?.applySelectionTransform?.()}
              aria-label={t("editor.selection.applyTransform")}
              className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-mono text-emerald-300 hover:bg-emerald-500/25 transition-colors"
            >
              <span>✓</span>
              <span>{t("editor.selection.applyTransform")}</span>
            </button>
          </EditorTooltip>

          {/* Cancel Transform */}
          <EditorTooltip title={t("editor.selection.cancelTransform")}>
            <button
              type="button"
              onClick={() => engine?.cancelSelectionTransform?.()}
              aria-label={t("editor.selection.cancelTransform")}
              className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-mono text-rose-300 hover:bg-rose-500/25 transition-colors"
            >
              <span>✕</span>
              <span>{t("editor.selection.cancelTransform")}</span>
            </button>
          </EditorTooltip>
        </>
      ) : hasSelection ? (
        <>
          <EditorLocalRepaintButton onRepaint={onRepaint} busy={repaintBusy} />

          {/* Transform Selection */}
          <EditorTooltip title={t("editor.taskbar.transform")}>
            <button
              type="button"
              onClick={() => {
                if (engine?.beginSelectionTransform?.()) return;
                engine?.setTool?.(TOOL.SELECT);
              }}
              aria-label={t("editor.taskbar.transform")}
              className={ICON_BTN_DEFAULT}
            >
              <IconVectorSquare size={14} />
            </button>
          </EditorTooltip>

          {/* Invert Selection */}
          <EditorTooltip title={t("editor.taskbar.invert")}>
            <button
              type="button"
              onClick={() => engine?.invertPixelSelection?.()}
              aria-label={t("editor.taskbar.invert")}
              className={ICON_BTN_DEFAULT}
            >
              <IconSwap size={14} />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* Deselect / Clear Selection */}
          <EditorTooltip title={t("editor.taskbar.deselect")}>
            <button
              type="button"
              onClick={() => engine?.clearSelection?.()}
              aria-label={t("editor.taskbar.deselect")}
              className={`${ICON_BTN} text-neutral-400 hover:bg-white/10 hover:text-white`}
            >
              <IconClose size={13} />
            </button>
          </EditorTooltip>
        </>
      ) : canCombine ? (
        /* 2. BOOLEAN & VECTOR SHAPES COMBINE CONTEXT */
        <>
          {BOOLEAN_OPERATIONS.map((op) => {
            const isActive =
              selected?.kind === "boolean" && selected.operation === op;
            return (
              <EditorTooltip key={op} title={t(`editor.props.combine.${op}`)}>
                <button
                  type="button"
                  onClick={() => engine?.combineSelected?.(op)}
                  aria-label={t(`editor.props.combine.${op}`)}
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? `${ICON_BTN} bg-[#b2ffd6]/20 text-[#b2ffd6] ring-1 ring-[#b2ffd6]/50`
                      : ICON_BTN_DEFAULT
                  }
                >
                  <OperationIcon operation={op} />
                </button>
              </EditorTooltip>
            );
          })}

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* Quick Alignment */}
          <EditorTooltip title={t("editor.props.alignShapes.left")}>
            <button
              type="button"
              onClick={() => engine?.layoutSelection?.(alignNodes, "left")}
              aria-label={t("editor.props.alignShapes.left")}
              className={ICON_BTN_DEFAULT}
            >
              <AlignIcon type="left" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.props.alignShapes.center")}>
            <button
              type="button"
              onClick={() => engine?.layoutSelection?.(alignNodes, "center")}
              aria-label={t("editor.props.alignShapes.center")}
              className={ICON_BTN_DEFAULT}
            >
              <AlignIcon type="center" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.props.alignShapes.middle")}>
            <button
              type="button"
              onClick={() => engine?.layoutSelection?.(alignNodes, "middle")}
              aria-label={t("editor.props.alignShapes.middle")}
              className={ICON_BTN_DEFAULT}
            >
              <AlignIcon type="middle" />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* Group */}
          <EditorTooltip title={t("editor.menu.group")}>
            <button
              type="button"
              onClick={() => engine?.groupSelection?.()}
              aria-label={t("editor.menu.group")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFolder size={14} />
            </button>
          </EditorTooltip>

          {/* Delete */}
          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={`${ICON_BTN} text-rose-400 hover:bg-rose-500/15`}
            >
              <IconTrash size={14} />
            </button>
          </EditorTooltip>
        </>
      ) : selectedCount > 1 ? (
        /* 3. MULTI-SELECTION (NON-COMBINABLE) ALIGNMENT CONTEXT */
        <>
          <EditorTooltip title={t("editor.props.alignShapes.left")}>
            <button
              type="button"
              onClick={() => engine?.layoutSelection?.(alignNodes, "left")}
              aria-label={t("editor.props.alignShapes.left")}
              className={ICON_BTN_DEFAULT}
            >
              <AlignIcon type="left" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.props.alignShapes.center")}>
            <button
              type="button"
              onClick={() => engine?.layoutSelection?.(alignNodes, "center")}
              aria-label={t("editor.props.alignShapes.center")}
              className={ICON_BTN_DEFAULT}
            >
              <AlignIcon type="center" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.props.alignShapes.right")}>
            <button
              type="button"
              onClick={() => engine?.layoutSelection?.(alignNodes, "right")}
              aria-label={t("editor.props.alignShapes.right")}
              className={ICON_BTN_DEFAULT}
            >
              <AlignIcon type="right" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.props.alignShapes.top")}>
            <button
              type="button"
              onClick={() => engine?.layoutSelection?.(alignNodes, "top")}
              aria-label={t("editor.props.alignShapes.top")}
              className={ICON_BTN_DEFAULT}
            >
              <AlignIcon type="top" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.props.alignShapes.middle")}>
            <button
              type="button"
              onClick={() => engine?.layoutSelection?.(alignNodes, "middle")}
              aria-label={t("editor.props.alignShapes.middle")}
              className={ICON_BTN_DEFAULT}
            >
              <AlignIcon type="middle" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.props.alignShapes.bottom")}>
            <button
              type="button"
              onClick={() => engine?.layoutSelection?.(alignNodes, "bottom")}
              aria-label={t("editor.props.alignShapes.bottom")}
              className={ICON_BTN_DEFAULT}
            >
              <AlignIcon type="bottom" />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* Group */}
          <EditorTooltip title={t("editor.menu.group")}>
            <button
              type="button"
              onClick={() => engine?.groupSelection?.()}
              aria-label={t("editor.menu.group")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFolder size={14} />
            </button>
          </EditorTooltip>

          {/* Delete */}
          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={`${ICON_BTN} text-rose-400 hover:bg-rose-500/15`}
            >
              <IconTrash size={14} />
            </button>
          </EditorTooltip>
        </>
      ) : isPenActive ? (
        /* 4. PEN TOOL / PATH EDITING CONTEXT */
        <>
          <EditorTooltip title={t("editor.pen.closeEdit")}>
            <button
              type="button"
              onClick={() => engine?.finishPenPath?.()}
              aria-label={t("editor.pen.closeEdit")}
              className={`${ICON_BTN} text-[#b2ffd6] hover:bg-[#b2ffd6]/20`}
            >
              <IconCheck size={14} />
            </button>
          </EditorTooltip>

          {engine?.deleteActiveAnchor ? (
            <EditorTooltip title={t("editor.pen.deleteAnchor")}>
              <button
                type="button"
                onClick={() => engine?.deleteActiveAnchor?.()}
                aria-label={t("editor.pen.deleteAnchor")}
                className={ICON_BTN_DEFAULT}
              >
                <IconTrash size={13} />
              </button>
            </EditorTooltip>
          ) : null}

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* Flip Horizontal */}
          <EditorTooltip title={t("editor.taskbar.flipH")}>
            <button
              type="button"
              onClick={() => engine?.flipHorizontal?.()}
              aria-label={t("editor.taskbar.flipH")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFlipH size={14} />
            </button>
          </EditorTooltip>

          {/* Duplicate */}
          <EditorTooltip title={t("editor.taskbar.duplicate")}>
            <button
              type="button"
              onClick={() => engine?.duplicateSelected?.()}
              aria-label={t("editor.taskbar.duplicate")}
              className={ICON_BTN_DEFAULT}
            >
              <IconCopy size={14} />
            </button>
          </EditorTooltip>

          {/* Delete */}
          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={`${ICON_BTN} text-rose-400 hover:bg-rose-500/15`}
            >
              <IconTrash size={14} />
            </button>
          </EditorTooltip>
        </>
      ) : isShape ? (
        /* 5. SINGLE SHAPE / VECTOR CONTEXT */
        <>
          {/* Flip Horizontal */}
          <EditorTooltip title={t("editor.taskbar.flipH")}>
            <button
              type="button"
              onClick={() => engine?.flipHorizontal?.()}
              aria-label={t("editor.taskbar.flipH")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFlipH size={14} />
            </button>
          </EditorTooltip>

          {/* Flip Vertical */}
          <EditorTooltip title={t("editor.taskbar.flipV")}>
            <button
              type="button"
              onClick={() => engine?.flipVertical?.()}
              aria-label={t("editor.taskbar.flipV")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFlipV size={14} />
            </button>
          </EditorTooltip>

          {/* Duplicate */}
          <EditorTooltip title={t("editor.taskbar.duplicate")}>
            <button
              type="button"
              onClick={() => engine?.duplicateSelected?.()}
              aria-label={t("editor.taskbar.duplicate")}
              className={ICON_BTN_DEFAULT}
            >
              <IconCopy size={14} />
            </button>
          </EditorTooltip>

          {/* Lock / Unlock */}
          <EditorTooltip
            title={
              isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")
            }
          >
            <button
              type="button"
              onClick={() => {
                if (selected?.id) engine?.toggleLock?.(selected.id);
              }}
              aria-label={
                isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")
              }
              className={ICON_BTN_DEFAULT}
            >
              {isLocked ? <IconUnlock size={14} /> : <IconLock size={14} />}
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* Delete */}
          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={`${ICON_BTN} text-rose-400 hover:bg-rose-500/15`}
            >
              <IconTrash size={14} />
            </button>
          </EditorTooltip>
        </>
      ) : isText ? (
        /* 6. SINGLE TEXT CONTEXT */
        <>
          {/* Duplicate */}
          <EditorTooltip title={t("editor.taskbar.duplicate")}>
            <button
              type="button"
              onClick={() => engine?.duplicateSelected?.()}
              aria-label={t("editor.taskbar.duplicate")}
              className={ICON_BTN_DEFAULT}
            >
              <IconCopy size={14} />
            </button>
          </EditorTooltip>

          {/* Lock / Unlock */}
          <EditorTooltip
            title={
              isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")
            }
          >
            <button
              type="button"
              onClick={() => {
                if (selected?.id) engine?.toggleLock?.(selected.id);
              }}
              aria-label={
                isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")
              }
              className={ICON_BTN_DEFAULT}
            >
              {isLocked ? <IconUnlock size={14} /> : <IconLock size={14} />}
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* Delete */}
          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={`${ICON_BTN} text-rose-400 hover:bg-rose-500/15`}
            >
              <IconTrash size={14} />
            </button>
          </EditorTooltip>
        </>
      ) : (
        /* 7. SINGLE IMAGE CONTEXT */
        <>
          {/* One-Click Matting / Remove Background */}
          <EditorTooltip
            title={
              maskBusy ? t("editor.mask.removing") : t("editor.taskbar.matting")
            }
          >
            <button
              type="button"
              onClick={() => void removeBackground?.()}
              disabled={maskBusy}
              aria-label={t("editor.taskbar.matting")}
              className={`${ICON_BTN_AI} disabled:opacity-40`}
            >
              <IconMask size={14} />
            </button>
          </EditorTooltip>

          <EditorLocalRepaintButton onRepaint={onRepaint} busy={repaintBusy} />

          {/* Color Adjustments & Effects Popover */}
          <div ref={adjustRef} className="relative">
            <EditorTooltip
              title={t("editor.taskbar.adjustments")}
              disabled={adjustOpen}
            >
              <button
                type="button"
                onClick={() => {
                  setAdjustOpen((o) => !o);
                  setMoreOpen(false);
                }}
                aria-expanded={adjustOpen}
                aria-haspopup="dialog"
                aria-label={t("editor.taskbar.adjustments")}
                className={`${ICON_BTN} ${
                  adjustOpen
                    ? "bg-white/15 text-white"
                    : "text-neutral-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <IconSliders size={14} />
              </button>
            </EditorTooltip>

            {adjustOpen ? (
              <AddKindPicker
                isImage={selected?.kind === "image"}
                bitmap={getBitmap?.(selected) ?? null}
                imageKey={selected?.imageId ?? selected?.src ?? null}
                adjustments={selected?.adjustments ?? null}
                showEffects={true}
                onPick={(kind, isEffect) => {
                  onAddAdjustmentLayer?.(kind, isEffect);
                  setAdjustOpen(false);
                }}
                onApplyPreset={(preset) => {
                  onApplyPreset?.(preset);
                  setAdjustOpen(false);
                }}
                onClose={() => setAdjustOpen(false)}
                side="top"
              />
            ) : null}
          </div>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* More Actions Popover */}
          <div ref={moreRef} className="relative">
            <EditorTooltip title={t("editor.taskbar.more")} disabled={moreOpen}>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen((o) => !o);
                  setAdjustOpen(false);
                }}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                aria-label={t("editor.taskbar.more")}
                className={`${ICON_BTN} ${
                  moreOpen
                    ? "bg-white/15 text-white"
                    : "text-neutral-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <IconMore size={14} />
              </button>
            </EditorTooltip>

            {moreOpen ? (
              <div
                role="dialog"
                aria-label={t("editor.taskbar.more")}
                className="node-editor-enter ui-scroll absolute bottom-full right-0 mb-2.5 max-h-[60vh] w-48 overflow-y-auto rounded-xl bg-neutral-900 p-1.5 shadow-menu font-mono text-[11px] text-neutral-200 z-50 select-none"
              >
                <div className="flex flex-col gap-0.5">
                  {selected?.kind === "image" ? (
                    <>
                      <EditorAiMenuSection
                        onOutpaint={onOutpaint}
                        onUpscale={onUpscale}
                        upscaleBusy={upscaleBusy}
                        onAutoEnhance={onAutoEnhance}
                        onPortraitRetouch={onPortraitRetouch}
                        portraitRetouchBusy={portraitRetouchBusy}
                        onSplitLayers={onSplitLayers}
                        splitLayersBusy={splitLayersBusy}
                        repaintBusy={repaintBusy}
                        onDone={() => setMoreOpen(false)}
                      />
                      <div className="my-1 h-px bg-white/[0.08]" />
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      engine?.duplicateSelected?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <IconCopy size={13} className="text-neutral-400 shrink-0" />
                    <span>{t("editor.taskbar.duplicate")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      engine?.copySelectedSvg?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <IconCopy size={13} className="text-neutral-400 shrink-0" />
                    <span>{t("editor.menu.copySvg")}</span>
                  </button>

                  {selected && onEditSvg ? (
                    <button
                      type="button"
                      onClick={() => {
                        onEditSvg(selected);
                        setMoreOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                    >
                      <IconCode
                        size={13}
                        className="text-neutral-400 shrink-0"
                      />
                      <span>{t("editor.menu.editSvg")}</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      engine?.flipHorizontal?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <IconFlipH
                      size={13}
                      className="text-neutral-400 shrink-0"
                    />
                    <span>{t("editor.taskbar.flipH")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      engine?.flipVertical?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <IconFlipV
                      size={13}
                      className="text-neutral-400 shrink-0"
                    />
                    <span>{t("editor.taskbar.flipV")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selected?.id) engine?.toggleLock?.(selected.id);
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    {isLocked ? (
                      <IconUnlock
                        size={13}
                        className="text-neutral-400 shrink-0"
                      />
                    ) : (
                      <IconLock
                        size={13}
                        className="text-neutral-400 shrink-0"
                      />
                    )}
                    <span>
                      {isLocked
                        ? t("editor.taskbar.unlock")
                        : t("editor.taskbar.lock")}
                    </span>
                  </button>

                  <div className="my-1 h-px bg-white/[0.08]" />

                  <button
                    type="button"
                    onClick={() => {
                      engine?.deleteSelected?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-rose-400 transition-colors hover:bg-rose-500/15"
                  >
                    <IconTrash size={13} className="shrink-0" />
                    <span>{t("editor.taskbar.delete")}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
      {/* Components: make one from the selection, or detach an instance. */}
      {!isTransforming && !isPenActive && selectedCount >= 1 ? (
        <>
          {selectedCount === 1 &&
          selected?.kind === "canvasInstance" &&
          onDetachInstance ? (
            <>
              <div className="mx-0.5 h-3.5 w-px shrink-0 bg-white/[0.08]" />
              <EditorTooltip title={t("editor.component.detach")}>
                <button
                  type="button"
                  data-testid="editor-taskbar-detach-instance"
                  onClick={() => onDetachInstance(selected.id)}
                  aria-label={t("editor.component.detach")}
                  className={ICON_BTN_DEFAULT}
                >
                  <IconUnlink size={14} />
                </button>
              </EditorTooltip>
            </>
          ) : onCreateComponent ? (
            <>
              <div className="mx-0.5 h-3.5 w-px shrink-0 bg-white/[0.08]" />
              <EditorTooltip title={t("editor.component.create")}>
                <button
                  type="button"
                  data-testid="editor-taskbar-create-component"
                  onClick={onCreateComponent}
                  aria-label={t("editor.component.create")}
                  className={ICON_BTN_DEFAULT}
                >
                  <IconDiamond size={14} />
                </button>
              </EditorTooltip>
            </>
          ) : null}
        </>
      ) : null}
    </nav>
  );
}

EditorContextualTaskBar.propTypes = {
  engine: PropTypes.object,
  tool: PropTypes.string,
  selected: PropTypes.object,
  hasSelection: PropTypes.bool,
  removeBackground: PropTypes.func,
  maskBusy: PropTypes.bool,
  onRepaint: PropTypes.func,
  repaintBusy: PropTypes.bool,
  onOutpaint: PropTypes.func,
  onUpscale: PropTypes.func,
  upscaleBusy: PropTypes.bool,
  onAutoEnhance: PropTypes.func,
  onPortraitRetouch: PropTypes.func,
  portraitRetouchBusy: PropTypes.bool,
  onSplitLayers: PropTypes.func,
  splitLayersBusy: PropTypes.bool,
  onAddAdjustmentLayer: PropTypes.func,
  onApplyPreset: PropTypes.func,
  getBitmap: PropTypes.func,
  docRect: PropTypes.object,
  stageRef: PropTypes.object,
  onEditSvg: PropTypes.func,
  onCreateComponent: PropTypes.func,
  onDetachInstance: PropTypes.func,
};

export default memo(EditorContextualTaskBar);
