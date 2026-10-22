import PropTypes from "prop-types";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconCheck,
  IconClose,
  IconExpand,
  IconCopy,
  IconFlipH,
  IconFlipV,
  IconFolder,
  IconHealAi,
  IconLayers,
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
  IconHd,
  IconUnlink,
  IconSelectionRect,
  IconSelectionFree,
  IconSparkles,
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
import EditorUpscaleButton from "./editor_upscale_button.jsx";
import EditorContextualAiInput, {
  extractNodeContext,
  dispatchToAgent,
} from "./editor_contextual_ai_input.jsx";
import { useI18n } from "../use_i18n.js";
import { TOOL } from "../editor/editor_constants.js";
import { EDITOR_PAGE_TOOLBAR_GAP } from "./editor_panel_layout.js";

export { extractNodeContext, dispatchToAgent };

/**
 * Adaptive Contextual Task Bar for Design Editor.
 *
 * Dynamically plans and adapts its tools based on current context:
 * 1. Image: 一键抠图 -> 涂抹修补 -> AI 重绘 (点击展开迷你输入框) -> 高清放大 -> More (翻转/复制/色彩/锁定/删除)
 * 2. Shape / Vector: 翻转 -> 复制 -> 锁定 -> 删除 -> AI 助手 (默认收起) -> More (复制 SVG/转曲线)
 * 3. Text: 复制 -> 锁定 -> 删除 -> AI 改写 (默认收起)
 * 4. Multi-Selection: 对齐 / 布尔运算 -> 编组 -> 删除 -> AI 助手 (默认收起)
 * 5. Pixel Selection: 重绘 (点击展开迷你输入框) -> 变换选区 -> 反选 -> 取消选区
 * 6. Pen Mode: 完成路径 -> 删除锚点 -> 翻转 -> 复制 -> 删除
 */
function EditorContextualTaskBar({
  engine,
  tool = null,
  selected = null,
  hasSelection = false,
  initialAiOpen = false,
  removeBackground = null,
  maskBusy = false,
  onRepaint = null,
  repaintBusy = false,
  onOutpaint = null,
  onUpscale = null,
  upscaleBusy = false,
  onAutoEnhance = null,
  onPortraitRetouch = null,
  portraitRetouchBusy = false,
  onSplitLayers = null,
  splitLayersBusy = false,
  onAddAdjustmentLayer = null,
  onApplyPreset = null,
  getBitmap = null,
  docRect = null,
  onEditSvg = null,
  onCreateComponent = null,
  onDetachInstance = null,
  onDispatch = null,
}) {
  const { t } = useI18n();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [aiInputOpen, setAiInputOpen] = useState(initialAiOpen);

  const barRef = useRef(null);
  const adjustRef = useRef(null);
  const moreRef = useRef(null);

  const selectedNode = selected || (engine?.getSelected?.() ?? null);
  const selectedIds =
    engine?.getSelectedIds?.() ?? (selected ? [selected.id] : []);
  const selectedCount = selectedIds.length;
  const isTransforming = Boolean(engine?.getSelectionTransform?.());
  const canCombine = engine?.canCombineSelection?.() ?? false;
  const isPenActive = tool === TOOL.PEN || Boolean(engine?.penEdit);

  // Reset popovers and AI input box when selection changes
  const lastSelectedIdRef = useRef(selectedNode?.id);
  if (lastSelectedIdRef.current !== selectedNode?.id) {
    lastSelectedIdRef.current = selectedNode?.id;
    if (aiInputOpen) setAiInputOpen(false);
    if (moreOpen) setMoreOpen(false);
    if (adjustOpen) setAdjustOpen(false);
  }

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
        setAiInputOpen(false);
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

  const isFrame = Boolean(
    selectedNode?.isFrame ||
      selectedNode?.kind === "frame" ||
      selectedNode?.kind === "artboard" ||
      (selectedNode?.kind === "rect" && selectedNode?.isFrame) ||
      selectedNode?.type === "imageEditor"
  );
  const isImage = selectedNode?.kind === "image" && selectedCount <= 1;
  const isText = selectedNode?.kind === "text" && selectedCount <= 1;
  const isShape =
    !isFrame &&
    selectedCount <= 1 &&
    (selectedNode?.kind === "rect" ||
      selectedNode?.kind === "ellipse" ||
      selectedNode?.kind === "path" ||
      selectedNode?.kind === "boolean");

  const handleAiAction = useCallback(
    ({ prompt, intent, tool: actionTool }) => {
      const context = extractNodeContext(selectedNode);
      const name = context?.name || "Layer";
      const finalPrompt =
        prompt || `Apply ${intent || actionTool || "AI action"} to @${name}`;
      dispatchToAgent({
        prompt: finalPrompt,
        intent: intent || finalPrompt,
        tool: actionTool || null,
        context,
        autoSend: true,
      });
      onDispatch?.({
        prompt: finalPrompt,
        intent: intent || finalPrompt,
        tool: actionTool || null,
        context,
      });
    },
    [selectedNode, onDispatch]
  );

  const handleAiDispatch = useCallback(
    (customPrompt, explicitContext) => {
      const context = explicitContext || extractNodeContext(selectedNode);
      const promptText = (typeof customPrompt === "string" ? customPrompt : "").trim();
      const name = context?.name || "Layer";
      const finalPrompt = promptText || `Ask AI to edit @${name}`;

      dispatchToAgent({
        prompt: finalPrompt,
        intent: finalPrompt,
        context,
        autoSend: Boolean(promptText),
      });
      onDispatch?.({
        prompt: finalPrompt,
        intent: finalPrompt,
        context,
      });
      setAiInputOpen(false);
    },
    [selectedNode, onDispatch]
  );

  const dynamicStyle = useMemo(() => {
    if (!docRect) return null;
    return {
      left: `${docRect.x + docRect.width / 2}px`,
      top: `${docRect.y + docRect.height + EDITOR_PAGE_TOOLBAR_GAP}px`,
    };
  }, [docRect]);

  // When nothing is active, hide the taskbar
  const isSelectionToolActive = tool === TOOL.MARQUEE || tool === TOOL.LASSO;
  if (
    !hasSelection &&
    !isTransforming &&
    selectedCount === 0 &&
    !selected &&
    !isPenActive &&
    !isSelectionToolActive
  ) {
    return null;
  }

  return (
    <nav
      ref={barRef}
      data-testid="editor-contextual-taskbar"
      aria-label={t("editor.taskbar.ariaLabel")}
      style={dynamicStyle ?? undefined}
      className={`pointer-events-auto z-20 flex items-center gap-1.5 rounded-full bg-neutral-900/95 border border-white/10 px-2 py-1 shadow-pop backdrop-blur-md transition-all whitespace-nowrap font-mono text-[11px] text-neutral-200 select-none ${
        dynamicStyle ? "absolute -translate-x-1/2" : "relative"
      }`}
    >
      {/* 0. 未选中任何对象且选区工具激活时：显示选区与套索快捷模式切换 */}
      {!selected && selectedCount === 0 && !hasSelection && !isTransforming && (
        <div className="flex items-center gap-1">
          <EditorTooltip title={`${t("editor.tool.marquee") || "选区"} (M)`}>
            <button
              type="button"
              onClick={() => {
                engine?.setMarqueeMode?.("rect");
                engine?.setTool?.(TOOL.MARQUEE);
              }}
              aria-label={`${t("editor.tool.marquee") || "选区"} (M)`}
              aria-pressed={
                tool === TOOL.MARQUEE &&
                engine?.getMarqueeMode?.() !== "poly" &&
                engine?.getMarqueeMode?.() !== "magnetic"
              }
              className={`${ICON_BTN} ${
                tool === TOOL.MARQUEE &&
                engine?.getMarqueeMode?.() !== "poly" &&
                engine?.getMarqueeMode?.() !== "magnetic"
                  ? "bg-white text-black font-semibold shadow-pop"
                  : "text-neutral-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <IconSelectionRect size={13} />
            </button>
          </EditorTooltip>

          <EditorTooltip title={`${t("editor.tool.lasso") || "套索"} (L)`}>
            <button
              type="button"
              onClick={() => {
                engine?.setTool?.(TOOL.LASSO);
              }}
              aria-label={`${t("editor.tool.lasso") || "套索"} (L)`}
              aria-pressed={
                tool === TOOL.LASSO ||
                (tool === TOOL.MARQUEE &&
                  (engine?.getMarqueeMode?.() === "poly" ||
                    engine?.getMarqueeMode?.() === "magnetic"))
              }
              className={`${ICON_BTN} ${
                tool === TOOL.LASSO ||
                (tool === TOOL.MARQUEE &&
                  (engine?.getMarqueeMode?.() === "poly" ||
                    engine?.getMarqueeMode?.() === "magnetic"))
                  ? "bg-white text-black font-semibold shadow-pop"
                  : "text-neutral-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <IconSelectionFree size={13} />
            </button>
          </EditorTooltip>

          <span className="px-2 py-0.5 text-[10px] text-neutral-400 font-sans">
            {tool === TOOL.LASSO ? "拖动自由圈选" : "拖动矩形框选"}
          </span>
        </div>
      )}

      {/* 1. SELECTION TRANSFORM CONTEXT */}
      {isTransforming ? (
        <>
          <EditorTooltip title={t("editor.selection.applyTransform")}>
            <button
              type="button"
              onClick={() => engine?.applySelectionTransform?.()}
              aria-label={t("editor.selection.applyTransform")}
              className={`${ICON_BTN} bg-white text-black hover:bg-neutral-200`}
            >
              <IconCheck size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.selection.cancelTransform")}>
            <button
              type="button"
              onClick={() => engine?.cancelSelectionTransform?.()}
              aria-label={t("editor.selection.cancelTransform")}
              className={ICON_BTN_DEFAULT}
            >
              <IconClose size={12} />
            </button>
          </EditorTooltip>
        </>
      ) : hasSelection ? (
        /* 2. PIXEL SELECTION CONTEXT (选区状态：重绘 / 变换 / 反选 / 取消) */
        <>
          <EditorTooltip title={t("editor.taskbar.repaint") || "AI 重绘选区"}>
            <button
              type="button"
              data-testid="editor-taskbar-ai-repaint"
              onClick={() => setAiInputOpen((prev) => !prev)}
              aria-label={t("editor.taskbar.repaint") || "AI 重绘"}
              aria-pressed={aiInputOpen}
              className={`${ICON_BTN_AI} ${
                aiInputOpen ? "bg-[#E5B2FF]/25 text-[#E5B2FF] ring-1 ring-[#E5B2FF]" : ""
              }`}
            >
              <IconSparkles size={12} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          {aiInputOpen ? (
            <EditorContextualAiInput
              selectedNode={selectedNode}
              autoFocus
              inputTestId="editor-taskbar-ai-input"
              submitTestId="editor-taskbar-ai-submit"
              placeholder={t("editor.taskbar.repaintPromptPlaceholder") || "描述重绘修改内容..."}
              onClose={() => setAiInputOpen(false)}
              onDispatch={(prompt, ctx) => {
                if (onRepaint) onRepaint(prompt);
                handleAiDispatch(prompt, ctx);
              }}
            />
          ) : null}

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
              <IconVectorSquare size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.invert")}>
            <button
              type="button"
              onClick={() => engine?.invertPixelSelection?.()}
              aria-label={t("editor.taskbar.invert")}
              className={ICON_BTN_DEFAULT}
            >
              <IconSwap size={12} />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

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
      ) : isImage ? (
        /* 3. 选中图片对象：先显示 AI 工具 (一键抠图 -> 扩图 -> 风格迁移 -> 矢量化 -> 涂抹 -> 重绘 -> 放大) -> more (翻转/复制/删除等) */
        <div className="flex items-center gap-1" data-testid="editor-taskbar-ai-image-actions">
          {/* 一键抠图 */}
          <EditorTooltip
            title={
              maskBusy
                ? (t("editor.mask.removing") || "正在抠图...")
                : (t("editor.taskbar.matting") || "一键抠图")
            }
          >
            <button
              type="button"
              data-testid="editor-taskbar-ai-remove-bg"
              onClick={() => {
                if (removeBackground) void removeBackground();
                handleAiAction({
                  prompt: `Remove background from @${selectedNode?.name || "Image"}`,
                  intent: "remove_background",
                  tool: "matting",
                });
              }}
              disabled={maskBusy}
              aria-label={t("editor.taskbar.matting") || "一键抠图"}
              className={`${ICON_BTN_AI} disabled:opacity-40`}
            >
              <IconMask size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          {/* AI 扩图 */}
          <EditorTooltip title={t("editor.taskbar.expand") || "AI 扩图"}>
            <button
              type="button"
              data-testid="editor-taskbar-ai-expand"
              onClick={() => {
                if (onOutpaint) onOutpaint();
                handleAiAction({
                  prompt: `Expand canvas and generate surrounding scene for @${selectedNode?.name || "Image"}`,
                  intent: "expand",
                  tool: "expand",
                });
              }}
              aria-label={t("editor.taskbar.expand") || "AI 扩图"}
              className={ICON_BTN_AI}
            >
              <IconExpand size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          {/* 风格迁移 */}
          <EditorTooltip title={t("editor.taskbar.styleTransfer") || "风格迁移"}>
            <button
              type="button"
              data-testid="editor-taskbar-ai-style-transfer"
              onClick={() =>
                handleAiAction({
                  prompt: `Apply style transfer to @${selectedNode?.name || "Image"}`,
                  intent: "style_transfer",
                  tool: "style_transfer",
                })
              }
              aria-label={t("editor.taskbar.styleTransfer") || "风格迁移"}
              className={ICON_BTN_AI}
            >
              <IconSliders size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          {/* 矢量化 */}
          <EditorTooltip title={t("editor.taskbar.vectorize") || "矢量化"}>
            <button
              type="button"
              data-testid="editor-taskbar-ai-vectorize"
              onClick={() =>
                handleAiAction({
                  prompt: `Vectorize @${selectedNode?.name || "Image"} into clean editable SVG paths`,
                  intent: "vectorize",
                  tool: "vectorize",
                })
              }
              aria-label={t("editor.taskbar.vectorize") || "矢量化"}
              className={ICON_BTN_AI}
            >
              <IconVectorSquare size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          {/* 涂抹修补 */}
          <EditorTooltip title={t("editor.taskbar.inpaint") || "涂抹修补"}>
            <button
              type="button"
              data-testid="editor-taskbar-ai-inpaint"
              onClick={() => {
                engine?.setHealingMode?.("aiRepair");
                engine?.setTool?.(TOOL.HEALING);
              }}
              aria-label={t("editor.taskbar.inpaint") || "涂抹修补"}
              aria-pressed={
                tool === TOOL.HEALING && engine?.getHealingMode?.() === "aiRepair"
              }
              className={`${ICON_BTN_AI} ${
                tool === TOOL.HEALING && engine?.getHealingMode?.() === "aiRepair"
                  ? "bg-[#E5B2FF]/25 text-[#E5B2FF] ring-1 ring-[#E5B2FF]"
                  : ""
              }`}
            >
              <IconHealAi size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          {/* Ask AI / 重绘 */}
          <EditorTooltip title={t("editor.taskbar.repaint") || "Ask AI"}>
            <button
              type="button"
              data-testid="editor-taskbar-ai-repaint"
              onClick={() => setAiInputOpen((prev) => !prev)}
              aria-label={t("editor.taskbar.repaint") || "AI 重绘"}
              aria-pressed={aiInputOpen}
              className={`${ICON_BTN_AI} ${
                aiInputOpen ? "bg-[#E5B2FF]/25 text-[#E5B2FF] ring-1 ring-[#E5B2FF]" : ""
              }`}
            >
              <IconSparkles size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          {/* 高清放大 */}
          {onUpscale ? (
            <EditorUpscaleButton
              onUpscale={onUpscale}
              busy={upscaleBusy}
            />
          ) : (
            <EditorTooltip title={t("editor.taskbar.upscale") || "高清放大 (Upscale)"}>
              <button
                type="button"
                data-testid="editor-taskbar-ai-upscale"
                onClick={() =>
                  handleAiAction({
                    prompt: `Upscale and enhance resolution of @${selectedNode?.name || "Image"}`,
                    intent: "upscale",
                    tool: "upscale",
                  })
                }
                disabled={upscaleBusy}
                aria-label={t("editor.taskbar.upscale") || "高清放大"}
                className={`${ICON_BTN_AI} disabled:opacity-40`}
              >
                <IconHd size={13} className="text-[#E5B2FF]" />
              </button>
            </EditorTooltip>
          )}

          {/* AI 迷你输入框 */}
          <EditorContextualAiInput
            selectedNode={selectedNode}
            autoFocus={false}
            inputTestId="editor-taskbar-ai-input"
            submitTestId="editor-taskbar-ai-submit"
            placeholder={t("editor.taskbar.repaintPromptPlaceholder") || "Ask AI to edit selection..."}
            onClose={() => setAiInputOpen(false)}
            onDispatch={(prompt, ctx) => {
              if (onRepaint) onRepaint(prompt);
              handleAiDispatch(prompt, ctx);
            }}
          />

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* more 菜单 (翻转 / 复制 / 色彩调整 / 锁定 / 删除) */}
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
                <IconMore size={12} />
              </button>
            </EditorTooltip>

            {moreOpen ? (
              <div
                role="dialog"
                aria-label={t("editor.taskbar.more")}
                className="node-editor-enter ui-scroll absolute bottom-full right-0 mb-2.5 max-h-[60vh] w-48 overflow-y-auto rounded-xl bg-neutral-900 p-1.5 shadow-menu font-mono text-[11px] text-neutral-200 z-50 select-none"
              >
                <div className="flex flex-col gap-0.5">
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

                  {/* 水平翻转 */}
                  <button
                    type="button"
                    onClick={() => {
                      engine?.flipHorizontal?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <IconFlipH size={13} className="text-neutral-400 shrink-0" />
                    <span>{t("editor.taskbar.flipH")}</span>
                  </button>

                  {/* 垂直翻转 */}
                  <button
                    type="button"
                    onClick={() => {
                      engine?.flipVertical?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <IconFlipV size={13} className="text-neutral-400 shrink-0" />
                    <span>{t("editor.taskbar.flipV")}</span>
                  </button>

                  {/* 复制 */}
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

                  {/* 复制 SVG */}
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

                  {/* 色彩调整 */}
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setAdjustOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <IconSliders size={13} className="text-neutral-400 shrink-0" />
                    <span>{t("editor.taskbar.adjustments")}</span>
                  </button>

                  {/* 锁定 / 解锁 */}
                  <button
                    type="button"
                    onClick={() => {
                      if (selected?.id) engine?.toggleLock?.(selected.id);
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    {isLocked ? (
                      <IconUnlock size={13} className="text-neutral-400 shrink-0" />
                    ) : (
                      <IconLock size={13} className="text-neutral-400 shrink-0" />
                    )}
                    <span>
                      {isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")}
                    </span>
                  </button>

                  <div className="my-1 h-px bg-white/[0.08]" />

                  {/* 删除 */}
                  <button
                    type="button"
                    onClick={() => {
                      engine?.deleteSelected?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <IconTrash size={13} className="text-neutral-400 shrink-0" />
                    <span>{t("editor.taskbar.delete")}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Color Adjustments Popover */}
          {adjustOpen ? (
            <div ref={adjustRef} className="absolute bottom-full right-0 mb-2 z-50">
              <AddKindPicker
                isImage={true}
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
            </div>
          ) : null}
        </div>
      ) : isShape ? (
        /* 4. 选中单图形 / 路径对象 (矢量化 / 布尔运算 / 风格迁移 / 翻转 / 复制 / 锁定 / 删除 / AI) */
        <div className="flex items-center gap-1" data-testid="editor-taskbar-ai-shape-actions">
          <EditorTooltip title="Vectorize">
            <button
              type="button"
              data-testid="editor-taskbar-ai-vectorize"
              onClick={() =>
                handleAiAction({
                  prompt: `Vectorize and simplify shape @${selectedNode?.name || "Shape"}`,
                  intent: "vectorize",
                  tool: "vectorize",
                })
              }
              aria-label="Vectorize"
              className={ICON_BTN_AI}
            >
              <IconVectorSquare size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorTooltip title="Boolean">
            <button
              type="button"
              data-testid="editor-taskbar-ai-boolean"
              onClick={() =>
                handleAiAction({
                  prompt: `Apply boolean operation on @${selectedNode?.name || "Shape"}`,
                  intent: "boolean",
                  tool: "boolean",
                })
              }
              aria-label="Boolean"
              className={ICON_BTN_AI}
            >
              <IconSwap size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorTooltip title="Style Transfer">
            <button
              type="button"
              data-testid="editor-taskbar-ai-style-transfer"
              onClick={() =>
                handleAiAction({
                  prompt: `Apply style transfer to @${selectedNode?.name || "Shape"}`,
                  intent: "style_transfer",
                  tool: "style_transfer",
                })
              }
              aria-label="Style Transfer"
              className={ICON_BTN_AI}
            >
              <IconSliders size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.flipH")}>
            <button
              type="button"
              onClick={() => engine?.flipHorizontal?.()}
              aria-label={t("editor.taskbar.flipH")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFlipH size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.flipV")}>
            <button
              type="button"
              onClick={() => engine?.flipVertical?.()}
              aria-label={t("editor.taskbar.flipV")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFlipV size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.duplicate")}>
            <button
              type="button"
              onClick={() => engine?.duplicateSelected?.()}
              aria-label={t("editor.taskbar.duplicate")}
              className={ICON_BTN_DEFAULT}
            >
              <IconCopy size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip
            title={isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")}
          >
            <button
              type="button"
              onClick={() => {
                if (selected?.id) engine?.toggleLock?.(selected.id);
              }}
              aria-label={isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")}
              className={ICON_BTN_DEFAULT}
            >
              {isLocked ? <IconUnlock size={12} /> : <IconLock size={12} />}
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={ICON_BTN_DEFAULT}
            >
              <IconTrash size={12} />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* AI 助手 */}
          <EditorTooltip title="Ask AI to modify shape">
            <button
              type="button"
              data-testid="editor-taskbar-ai-sparkle"
              onClick={() => setAiInputOpen((prev) => !prev)}
              aria-label="Ask AI"
              aria-pressed={aiInputOpen}
              className={`${ICON_BTN_AI} ${
                aiInputOpen ? "bg-[#E5B2FF]/25 text-[#E5B2FF] ring-1 ring-[#E5B2FF]" : ""
              }`}
            >
              <IconSparkles size={12} strokeWidth={1.5} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorContextualAiInput
            selectedNode={selectedNode}
            autoFocus={false}
            inputTestId="editor-taskbar-ai-input"
            submitTestId="editor-taskbar-ai-submit"
            onClose={() => setAiInputOpen(false)}
            onDispatch={(prompt, ctx) => handleAiDispatch(prompt, ctx)}
          />

          {/* More actions popover */}
          <div ref={moreRef} className="relative">
            <EditorTooltip title={t("editor.taskbar.more")} disabled={moreOpen}>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                aria-label={t("editor.taskbar.more")}
                className={ICON_BTN_DEFAULT}
              >
                <IconMore size={12} />
              </button>
            </EditorTooltip>

            {moreOpen ? (
              <div
                role="dialog"
                className="node-editor-enter ui-scroll absolute bottom-full right-0 mb-2.5 w-44 rounded-xl bg-neutral-900 p-1.5 shadow-menu font-mono text-[11px] text-neutral-200 z-50 select-none"
              >
                <button
                  type="button"
                  onClick={() => {
                    engine?.copySelectedSvg?.();
                    setMoreOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 hover:bg-white/[0.08]"
                >
                  <IconCopy size={13} className="text-neutral-400" />
                  <span>{t("editor.menu.copySvg")}</span>
                </button>
                {selectedNode && !["path", "image", "group", "frame"].includes(selectedNode.kind) ? (
                  <button
                    type="button"
                    onClick={() => {
                      engine?.convertSelectedToPath?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 hover:bg-white/[0.08]"
                  >
                    <IconVectorSquare size={13} className="text-neutral-400" />
                    <span>{t("editor.props.convertToCurves") || "转为曲线"}</span>
                  </button>
                ) : null}
                {onEditSvg ? (
                  <button
                    type="button"
                    onClick={() => {
                      onEditSvg(selected);
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 hover:bg-white/[0.08]"
                  >
                    <IconCode size={13} className="text-neutral-400" />
                    <span>{t("editor.menu.editSvg")}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : isText ? (
        /* 5. 选中文字对象 (文案润色 / 改写 / 矢量化 / 复制 / 锁定 / 删除 / AI) */
        <div className="flex items-center gap-1" data-testid="editor-taskbar-ai-text-actions">
          <EditorTooltip title="Edit Copy">
            <button
              type="button"
              data-testid="editor-taskbar-ai-edit-copy"
              onClick={() =>
                handleAiAction({
                  prompt: `Edit copy for @${selectedNode?.name || "Text"}`,
                  intent: "edit_copy",
                  tool: "edit_copy",
                })
              }
              aria-label="Edit Copy"
              className={ICON_BTN_AI}
            >
              <IconCode size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorTooltip title="Rewrite">
            <button
              type="button"
              data-testid="editor-taskbar-ai-rewrite"
              onClick={() =>
                handleAiAction({
                  prompt: `Rewrite and polish @${selectedNode?.name || "Text"} with engaging tone`,
                  intent: "rewrite",
                  tool: "rewrite",
                })
              }
              aria-label="Rewrite"
              className={ICON_BTN_AI}
            >
              <IconSparkles size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorTooltip title="Convert to Curves">
            <button
              type="button"
              data-testid="editor-taskbar-ai-vectorize"
              onClick={() =>
                handleAiAction({
                  prompt: `Convert @${selectedNode?.name || "Text"} to vector curves`,
                  intent: "vectorize",
                  tool: "vectorize",
                })
              }
              aria-label="Vectorize"
              className={ICON_BTN_AI}
            >
              <IconVectorSquare size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.duplicate")}>
            <button
              type="button"
              onClick={() => engine?.duplicateSelected?.()}
              aria-label={t("editor.taskbar.duplicate")}
              className={ICON_BTN_DEFAULT}
            >
              <IconCopy size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip
            title={isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")}
          >
            <button
              type="button"
              onClick={() => {
                if (selected?.id) engine?.toggleLock?.(selected.id);
              }}
              aria-label={isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")}
              className={ICON_BTN_DEFAULT}
            >
              {isLocked ? <IconUnlock size={12} /> : <IconLock size={12} />}
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={ICON_BTN_DEFAULT}
            >
              <IconTrash size={12} />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          {/* AI 改写 */}
          <EditorTooltip title="Ask AI to rewrite text">
            <button
              type="button"
              data-testid="editor-taskbar-ai-sparkle"
              onClick={() => setAiInputOpen((prev) => !prev)}
              aria-label="Ask AI"
              aria-pressed={aiInputOpen}
              className={`${ICON_BTN_AI} ${
                aiInputOpen ? "bg-[#E5B2FF]/25 text-[#E5B2FF] ring-1 ring-[#E5B2FF]" : ""
              }`}
            >
              <IconSparkles size={12} strokeWidth={1.5} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorContextualAiInput
            selectedNode={selectedNode}
            autoFocus={false}
            inputTestId="editor-taskbar-ai-input"
            submitTestId="editor-taskbar-ai-submit"
            onClose={() => setAiInputOpen(false)}
            onDispatch={(prompt, ctx) => handleAiDispatch(prompt, ctx)}
          />
        </div>
      ) : canCombine ? (
        /* 6. 多选几何布尔运算 */
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
                      ? `${ICON_BTN} bg-white/20 text-white ring-1 ring-white/30`
                      : ICON_BTN_DEFAULT
                  }
                >
                  <OperationIcon operation={op} />
                </button>
              </EditorTooltip>
            );
          })}

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

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

          <EditorTooltip title={t("editor.menu.group")}>
            <button
              type="button"
              onClick={() => engine?.groupSelection?.()}
              aria-label={t("editor.menu.group")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFolder size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={ICON_BTN_DEFAULT}
            >
              <IconTrash size={12} />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          <EditorTooltip title="Ask AI">
            <button
              type="button"
              data-testid="editor-taskbar-ai-sparkle"
              onClick={() => setAiInputOpen((prev) => !prev)}
              aria-label="Ask AI"
              aria-pressed={aiInputOpen}
              className={`${ICON_BTN_AI} ${
                aiInputOpen ? "bg-[#E5B2FF]/25 text-[#E5B2FF] ring-1 ring-[#E5B2FF]" : ""
              }`}
            >
              <IconSparkles size={12} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          {aiInputOpen ? (
            <EditorContextualAiInput
              selectedNode={selectedNode}
              autoFocus
              inputTestId="editor-taskbar-ai-input"
              submitTestId="editor-taskbar-ai-submit"
              onClose={() => setAiInputOpen(false)}
              onDispatch={(prompt, ctx) => handleAiDispatch(prompt, ctx)}
            />
          ) : null}
        </>
      ) : selectedCount > 1 ? (
        /* 7. 多选对齐 (左 / 居中 / 右 / 顶 / 垂直居中 / 底) */
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

          <EditorTooltip title={t("editor.menu.group")}>
            <button
              type="button"
              onClick={() => engine?.groupSelection?.()}
              aria-label={t("editor.menu.group")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFolder size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={ICON_BTN_DEFAULT}
            >
              <IconTrash size={12} />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          <EditorTooltip title="Ask AI">
            <button
              type="button"
              data-testid="editor-taskbar-ai-sparkle"
              onClick={() => setAiInputOpen((prev) => !prev)}
              aria-label="Ask AI"
              aria-pressed={aiInputOpen}
              className={`${ICON_BTN_AI} ${
                aiInputOpen ? "bg-[#E5B2FF]/25 text-[#E5B2FF] ring-1 ring-[#E5B2FF]" : ""
              }`}
            >
              <IconSparkles size={12} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          {aiInputOpen ? (
            <EditorContextualAiInput
              selectedNode={selectedNode}
              autoFocus
              inputTestId="editor-taskbar-ai-input"
              submitTestId="editor-taskbar-ai-submit"
              onClose={() => setAiInputOpen(false)}
              onDispatch={(prompt, ctx) => handleAiDispatch(prompt, ctx)}
            />
          ) : null}
        </>
      ) : isPenActive ? (
        /* 8. 钢笔路径编辑状态 */
        <>
          <EditorTooltip title={t("editor.pen.closeEdit")}>
            <button
              type="button"
              onClick={() => engine?.finishPenPath?.()}
              aria-label={t("editor.pen.closeEdit")}
              className={`${ICON_BTN} text-white hover:bg-white/15`}
            >
              <IconCheck size={12} />
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

          <EditorTooltip title={t("editor.taskbar.flipH")}>
            <button
              type="button"
              onClick={() => engine?.flipHorizontal?.()}
              aria-label={t("editor.taskbar.flipH")}
              className={ICON_BTN_DEFAULT}
            >
              <IconFlipH size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.duplicate")}>
            <button
              type="button"
              onClick={() => engine?.duplicateSelected?.()}
              aria-label={t("editor.taskbar.duplicate")}
              className={ICON_BTN_DEFAULT}
            >
              <IconCopy size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={ICON_BTN_DEFAULT}
            >
              <IconTrash size={12} />
            </button>
          </EditorTooltip>
        </>
      ) : isFrame ? (
        /* 9. Frame / Artboard 画板对象 (风格迁移 / 优化布局 / 生成布局 / 复制 / 锁定 / 删除 / AI) */
        <div className="flex items-center gap-1" data-testid="editor-taskbar-ai-frame-actions">
          <EditorTooltip title="Style Transfer">
            <button
              type="button"
              data-testid="editor-taskbar-ai-style-transfer"
              onClick={() =>
                handleAiAction({
                  prompt: `Apply design style transfer to frame @${selectedNode?.name || "Frame"}`,
                  intent: "style_transfer",
                  tool: "style_transfer",
                })
              }
              aria-label="Style Transfer"
              className={ICON_BTN_AI}
            >
              <IconSliders size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorTooltip title="Edit Layout">
            <button
              type="button"
              data-testid="editor-taskbar-ai-edit-layout"
              onClick={() =>
                handleAiAction({
                  prompt: `Optimize and align auto-layout for @${selectedNode?.name || "Frame"}`,
                  intent: "edit_layout",
                  tool: "edit_layout",
                })
              }
              aria-label="Edit Layout"
              className={ICON_BTN_AI}
            >
              <IconLayers size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorTooltip title="Generate Layout">
            <button
              type="button"
              data-testid="editor-taskbar-ai-generate-layout"
              onClick={() =>
                handleAiAction({
                  prompt: `Generate responsive layout structure in @${selectedNode?.name || "Frame"}`,
                  intent: "generate_layout",
                  tool: "generate_layout",
                })
              }
              aria-label="Generate Layout"
              className={ICON_BTN_AI}
            >
              <IconSparkles size={13} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.duplicate")}>
            <button
              type="button"
              onClick={() => engine?.duplicateSelected?.()}
              aria-label={t("editor.taskbar.duplicate")}
              className={ICON_BTN_DEFAULT}
            >
              <IconCopy size={12} />
            </button>
          </EditorTooltip>

          <EditorTooltip
            title={isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")}
          >
            <button
              type="button"
              onClick={() => {
                if (selected?.id) engine?.toggleLock?.(selected.id);
              }}
              aria-label={isLocked ? t("editor.taskbar.unlock") : t("editor.taskbar.lock")}
              className={ICON_BTN_DEFAULT}
            >
              {isLocked ? <IconUnlock size={12} /> : <IconLock size={12} />}
            </button>
          </EditorTooltip>

          <EditorTooltip title={t("editor.taskbar.delete")}>
            <button
              type="button"
              onClick={() => engine?.deleteSelected?.()}
              aria-label={t("editor.taskbar.delete")}
              className={ICON_BTN_DEFAULT}
            >
              <IconTrash size={12} />
            </button>
          </EditorTooltip>

          <div className="mx-0.5 h-3.5 w-px bg-white/[0.08] shrink-0" />

          <EditorTooltip title="Ask AI to layout frame">
            <button
              type="button"
              data-testid="editor-taskbar-ai-sparkle"
              onClick={() => setAiInputOpen((prev) => !prev)}
              aria-label="Ask AI"
              aria-pressed={aiInputOpen}
              className={`${ICON_BTN_AI} ${
                aiInputOpen ? "bg-[#E5B2FF]/25 text-[#E5B2FF] ring-1 ring-[#E5B2FF]" : ""
              }`}
            >
              <IconSparkles size={12} strokeWidth={1.5} className="text-[#E5B2FF]" />
            </button>
          </EditorTooltip>

          <EditorContextualAiInput
            selectedNode={selectedNode}
            autoFocus={false}
            inputTestId="editor-taskbar-ai-input"
            submitTestId="editor-taskbar-ai-submit"
            onClose={() => setAiInputOpen(false)}
            onDispatch={(prompt, ctx) => handleAiDispatch(prompt, ctx)}
          />
        </div>
      ) : null}

      {/* Component creation / instance detach */}
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
                  <IconUnlink size={12} />
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
                  <IconDiamond size={12} />
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
  initialAiOpen: PropTypes.bool,
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
  onDispatch: PropTypes.func,
};

export default memo(EditorContextualTaskBar);
