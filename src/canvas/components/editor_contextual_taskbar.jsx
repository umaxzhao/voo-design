import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconClose, IconCopy, IconFlipH, IconFlipV, IconFolder, IconLayers, IconLock, IconMask, IconMore, IconAdjust, IconSwap, IconTrash, IconUnlock, IconUnlink, IconDiamond, IconSparkles, IconEye, IconEyeOff, IconArrowUp, IconCrop } from "../icons.jsx";
import { OperationIcon } from "./editor_properties/combine_section.jsx";
import { AlignIcon, DistributeIcon, TidyIcon } from "./alignment_icon.jsx";
import { alignNodes, distributeNodes, tidyNodes } from "../editor/align_ops.js";
import { BOOLEAN_OPERATIONS } from "../editor/scene_model.js";
import AddKindPicker from "./editor_properties/add_kind_picker.jsx";
import EditorTooltip from "./editor_tooltip.jsx";
import EditorTaskbarActionMenu from "./editor_taskbar_action_menu.jsx";
import { EditorAiMenuSection } from "./editor_ai_taskbar_buttons.jsx";
import { clearActivePixelSelection, finishPenPathEditing } from "./editor_taskbar_actions.js";
import EditorContextualAiInput, { extractNodeContext, dispatchToAgent } from "./editor_contextual_ai_input.jsx";
import { useI18n } from "../use_i18n.js";
import { TOOL } from "../editor/editor_constants.js";
import { EDITOR_PAGE_TOOLBAR_GAP } from "./editor_panel_layout.js";
import { useMobileQuickbarPortal } from "./editor_hooks/use_mobile_quickbar_portal.js";
export { extractNodeContext, dispatchToAgent };
const BUTTON = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4] disabled:opacity-40";
function Divider() {
  return <span aria-hidden="true" className="mx-1 h-3.5 w-[1px] shrink-0 bg-white/15" />;
}
function QuickbarAiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" fill="none" stroke="currentColor" className="text-accent-purple" aria-hidden="true">
      <path d="M28.2308 19L24.5487 9.4267C24.22 8.572 23.0108 8.57201 22.682 9.4267L19 19L9.4267 22.682C8.572 23.0108 8.57201 24.22 9.4267 24.5487L19 28.2308L22.682 37.8041C23.0108 38.6588 24.22 38.6588 24.5487 37.8041L28.2308 28.2308L37.8041 24.5487C38.6588 24.22 38.6588 23.0108 37.8041 22.682L28.2308 19Z" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Action({
  label,
  id,
  icon,
  shortcut,
  active,
  ...props
}) {
  return <EditorTooltip title={label} shortcut={shortcut}><button type="button" aria-label={label} data-testid={`editor-taskbar-${id}`} aria-pressed={active} className={`${BUTTON} ${active ? "bg-white/15 text-neutral-200" : ""}`} {...props}>{icon}</button></EditorTooltip>;
}

// Coordinates are in the editor overlay's viewport coordinate system.
export function clampQuickbar(docRect, width, viewportWidth) {
  const half = Math.min(width, viewportWidth - 16) / 2;
  return {
    left: Math.max(
      8 + half,
      Math.min(docRect.x + docRect.width / 2, viewportWidth - 8 - half),
    ),
    // Stay below the frame even when it extends beyond the visible viewport.
    top: docRect.y + docRect.height + EDITOR_PAGE_TOOLBAR_GAP,
  };
}

export function reorderSelection(engine, ids, direction) {
  if (direction > 0 && engine?.bringForward) return engine.bringForward();
  if (direction < 0 && engine?.sendBackward) return engine.sendBackward();
  if (engine?.reorderNodes) return engine.reorderNodes(ids, direction);
  if (!engine?.reorderNode || !Array.isArray(ids) || ids.length === 0) return;
  const nodes = engine.getDoc?.()?.nodes ?? [];
  const indexes = new Map(nodes.map((entry, index) => [entry.id, index]));
  const orderedIds = [...ids].sort((first, second) => {
    const firstIndex = indexes.get(first) ?? -1;
    const secondIndex = indexes.get(second) ?? -1;
    return direction > 0 ? secondIndex - firstIndex : firstIndex - secondIndex;
  });
  orderedIds.forEach((id) => engine.reorderNode(id, direction));
}
function EditorContextualTaskBar({
  engine,
  tool = null,
  selected = null,
  selectedIds = null,
  hasSelection = false,
  initialAiOpen = false,
  removeBackground,
  maskBusy = false,
  onRepaint,
  onOutpaint,
  onUpscale,
  upscaleBusy,
  onAutoEnhance,
  onPortraitRetouch,
  portraitRetouchBusy,
  onSplitLayers,
  splitLayersBusy,
  onAddAdjustmentLayer,
  onApplyPreset,
  getBitmap,
  docRect = null,
  docked = false,
  onCreateComponent,
  onDetachInstance,
  onDispatch
}) {
  const {
    t
  } = useI18n();
  const [aiInputOpen, setAiInputOpen] = useState(initialAiOpen);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const barRef = useRef(null);
  const fileRef = useRef(null);
  const node = selected ?? engine?.getSelected?.();
  const pickIds = list => (Array.isArray(list) && list.length ? list : null);
  const engineIds = pickIds(selectedIds) ?? pickIds(engine?.getSelectedIds?.()) ?? pickIds(engine?.getSelectedNodes?.()?.map(n => n?.id).filter(Boolean));
  const ids = engineIds?.length ? engineIds : node ? [node.id] : [];
  const count = Math.max(ids.length, node ? 1 : 0);
  const selectionKey = ids.join(",");
  useEffect(() => {
    setAiInputOpen(false);
    setAdjustOpen(false);
    setMoreOpen(false);
  }, [selectionKey]);
  const transforming = Boolean(engine?.getSelectionTransform?.());
  const pen = [TOOL.PEN, TOOL.CURVATURE_PEN, TOOL.FREE_PEN].includes(tool) || Boolean(engine?.penEdit);
  const selectionTool = tool === TOOL.MARQUEE || tool === TOOL.LASSO;
  const active = Boolean(node || count || hasSelection || transforming || pen || selectionTool);
  const mobilePortal = useMobileQuickbarPortal(barRef, active, docked);
  const type = count > 1 ? "multi" : node?.isFrame || ["frame", "artboard"].includes(node?.kind) || node?.type === "imageEditor" ? "frame" : node?.kind === "group" ? "group" : node?.kind === "image" ? "image" : node?.kind === "text" ? "text" : "shape";
  const label = key => t(`editor.taskbar.${key}`);
  const edit = patch => {
    if (node?.id) engine?.updateNode?.(node.id, patch);
  };
  const editAll = patch => ids.forEach(id => engine?.updateNode?.(id, patch));
  useEffect(() => {
    const close = event => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && (barRef.current?.contains(event.target) || event.target.closest?.("[data-editor-adjustment-picker]"))) return;
      setAdjustOpen(false);
      setMoreOpen(false);
      if (event.type === "keydown") setAiInputOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, []);
  useLayoutEffect(() => {
    if (!docRect || !active || docked) return;
    const place = () => {
      const bar = barRef.current;
      const parent = bar?.offsetParent?.getBoundingClientRect();
      const origin = {
        x: parent?.left || 0,
        y: parent?.top || 0
      };
      const next = clampQuickbar({
        ...docRect,
        x: docRect.x + origin.x,
        y: docRect.y + origin.y
      }, bar?.offsetWidth || 400, window.innerWidth);
      setPosition({
        left: next.left - origin.x,
        top: next.top - origin.y
      });
    };
    place();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (barRef.current) observer?.observe(barRef.current);
    window.addEventListener("resize", place);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [docRect, active, docked, selectionKey, aiInputOpen, type, mobilePortal]);
  if (!active) return null;
  const action = (id, icon, onClick, extra = {}) => <Action key={id} id={id} label={label(id)} icon={icon} onClick={onClick} {...extra} />;
  const booleanActions = engine?.canCombineSelection?.() ? <EditorTaskbarActionMenu key={`boolean-${selectionKey}`} id="boolean" label={label("boolean")} icon={<OperationIcon operation="union" />}>{BOOLEAN_OPERATIONS.map(op => <Action key={op} id={`boolean-${op}`} label={t(`editor.props.combine.${op}`)} icon={<OperationIcon operation={op} />} onClick={() => engine?.combineSelected?.(op)} />)}</EditorTaskbarActionMenu> : null;
  const dispatch = (prompt, context) => {
    const payload = {
      prompt,
      intent: prompt,
      context: context || extractNodeContext(node),
      autoSend: true
    };
    dispatchToAgent(payload);
    onDispatch?.(payload);
    setAiInputOpen(false);
  };
  const ai = <>{action("ai-sparkle", <QuickbarAiIcon />, () => setAiInputOpen(open => !open), {
      label: label("askAgent"),
      active: aiInputOpen,
      "aria-expanded": aiInputOpen
    })}{aiInputOpen && <EditorContextualAiInput selectedNode={node} autoFocus placeholder={label("askPlaceholder")} inputTestId="editor-taskbar-ai-input" submitTestId="editor-taskbar-ai-submit" onClose={() => setAiInputOpen(false)} onDispatch={(prompt, context) => {
      if (hasSelection) onRepaint?.(prompt);
      dispatch(prompt, context);
    }} />}</>;
  const toolbar = <nav ref={barRef} data-testid="editor-contextual-taskbar" aria-label={label("ariaLabel")} style={docked ? {
    left: "50%",
    bottom: "3.25rem",
    maxWidth: "calc(100vw - 16px)"
  } : docRect ? {
    left: position?.left ?? docRect.x + docRect.width / 2,
    top: position?.top ?? docRect.y + docRect.height + EDITOR_PAGE_TOOLBAR_GAP,
    maxWidth: "calc(100vw - 16px)"
  } : {
    maxWidth: "calc(100vw - 16px)"
  }} className={`pointer-events-auto z-40 flex items-center gap-0.5 rounded-full bg-neutral-900/95 border border-white/10 px-2 py-1 shadow-pop backdrop-blur-md whitespace-nowrap text-[11px] text-neutral-200 select-none ${docked ? "absolute bottom-[3.25rem] left-1/2 -translate-x-1/2" : docRect ? "absolute -translate-x-1/2" : "relative"}`}>
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto" data-testid={`editor-taskbar-${type}-actions`}>
    {transforming ? <>{action("applyTransform", <IconCheck size={14} strokeWidth={1.5} />, () => engine?.applySelectionTransform?.())}{action("cancelTransform", <IconClose size={14} strokeWidth={1.5} />, () => engine?.cancelSelectionTransform?.())}</> : pen ? <>{action("finishPath", <IconCheck size={14} strokeWidth={1.5} />, () => finishPenPathEditing(engine), { label: t("editor.pen.closeEdit") })}</> : hasSelection ? <>{action("transform", <IconCrop size={14} strokeWidth={1.5} />, () => engine?.beginSelectionTransform?.())}{action("invert", <IconSwap size={14} strokeWidth={1.5} />, () => engine?.invertPixelSelection?.())}{action("deselect", <IconClose size={14} strokeWidth={1.5} />, () => clearActivePixelSelection(engine))}<Divider />{ai}</> : <>
      {!node && !count && selectionTool ? <>{action("marquee", <IconCrop size={14} strokeWidth={1.5} />, () => engine?.setTool?.(TOOL.MARQUEE))}{action("lasso", <IconUnlink size={14} strokeWidth={1.5} />, () => engine?.setTool?.(TOOL.LASSO))}</> : <>
      {type === "image" && <>
        {action("crop", <IconCrop size={14} strokeWidth={1.5} />, () => engine?.setTool?.(TOOL.CROP))}
        {action("replace", <IconSwap size={14} strokeWidth={1.5} />, () => fileRef.current?.click())}
        <input ref={fileRef} hidden type="file" accept="image/*" aria-label={label("replace")} onChange={event => {
              const file = event.target.files?.[0];
              const id = node?.id;
              if (file && id && engine?.replaceNodeBitmap) {
                const reader = new FileReader();
                reader.onload = () => {
                  void engine.replaceNodeBitmap(id, reader.result, {
                    resetCrop: true
                  });
                };
                reader.readAsDataURL(file);
              }
              event.target.value = "";
            }} />
        {action("ai-remove-bg", <IconMask size={14} strokeWidth={1.5} />, () => {
              void removeBackground?.();
            }, {
              label: label("matting"),
              disabled: maskBusy || !removeBackground
            })}
        {action("adjust", <IconAdjust size={14} strokeWidth={1.5} />, () => {
              setAdjustOpen(!adjustOpen);
              setMoreOpen(false);
            }, {
              active: adjustOpen
            })}
        {action("more", <IconMore size={14} strokeWidth={1.5} />, () => {
              setMoreOpen(!moreOpen);
              setAdjustOpen(false);
            }, {
              active: moreOpen
            })}
      </>}
      {type === "shape" && <>
        {["fill", "stroke"].map(paint => <EditorTooltip key={paint} title={label(paint)}><label className={`${BUTTON} relative`}><span className={`h-3.5 w-3.5 rounded-md border ${paint === "stroke" ? "border-2 border-white" : "border-white/40"}`} style={{
                  background: paint === "fill" && typeof node?.fill === "string" ? node.fill : undefined
                }} /><input type="color" data-testid={`editor-taskbar-${paint}`} aria-label={label(paint)} value={/^#[0-9a-f]{6}$/i.test(node?.[paint]) ? node[paint] : "#ffffff"} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={event => edit({
                  [paint]: event.target.value,
                  ...(paint === "stroke" ? {
                    strokeWidth: node?.strokeWidth || 2
                  } : {})
                })} /></label></EditorTooltip>)}
        {booleanActions}
        {action("flipH", <IconFlipH size={14} strokeWidth={1.5} />, () => engine?.flipHorizontal?.())}
        {action("flipV", <IconFlipV size={14} strokeWidth={1.5} />, () => engine?.flipVertical?.())}
      </>}
      {type === "frame" && action("autoLayout", <IconLayers size={14} strokeWidth={1.5} />, () => edit({
            autoLayout: node?.autoLayout ? null : {
              direction: "vertical",
              gap: 8,
              padding: 0,
              alignItems: "start",
              justifyContent: "start",
              widthMode: "fixed",
              heightMode: "hug"
            }
          }), {
            active: Boolean(node?.autoLayout)
          })}
      {type === "group" && action("ungroup", <IconUnlink size={14} strokeWidth={1.5} />, () => engine?.ungroupSelection?.())}
      {count > 0 && !["adjustment", "audio", "region"].includes(node?.kind) && <>
        <EditorTaskbarActionMenu key={`align-${selectionKey}`} id="alignment" label={t("editor.props.align")} icon={<AlignIcon type="left" />}>
        {["left", "center", "right", "top", "middle", "bottom"].map(align => <Action key={align} id={`align-${align}`} label={t(`editor.props.alignShapes.${align}`)} icon={<AlignIcon type={align} />} onClick={() => engine?.layoutSelection?.(alignNodes, align)} />)}
        {["horizontal", "vertical"].map(axis => <Action key={axis} id={`distribute-${axis}`} label={t(`editor.props.distribute.${axis}`)} icon={<DistributeIcon axis={axis} />} disabled={count < 3 || !engine?.layoutSelection} onClick={() => engine?.layoutSelection?.(distributeNodes, axis)} />)}
        {["horizontal", "vertical"].map(axis => <Action key={`tidy-${axis}`} id={`tidy-${axis}`} label={t(axis === "horizontal" ? "editor.props.distributeSpacingH" : "editor.props.distributeSpacingV")} icon={<TidyIcon axis={axis} />} disabled={count < 3 || !engine?.layoutSelection} onClick={() => engine?.layoutSelection?.(tidyNodes, axis)} />)}
        </EditorTaskbarActionMenu>
      </>}
      {type === "multi" && <>
        {action("group", <IconFolder size={14} strokeWidth={1.5} />, () => engine?.groupSelection?.())}{booleanActions}
      </>}
      <Divider />
      {action("bringForward", <IconArrowUp size={14} strokeWidth={1.5} />, () => reorderSelection(engine, ids, 1))}
      {action("sendBackward", <IconArrowUp size={14} strokeWidth={1.5} className="rotate-180" />, () => reorderSelection(engine, ids, -1))}
      <Divider />
      {action("duplicate", <IconCopy size={14} strokeWidth={1.5} />, () => engine?.duplicateSelected?.(), {
            shortcut: typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘D" : "Ctrl+D"
          })}
      {action(node?.locked ? "unlock" : "lock", node?.locked ? <IconUnlock size={14} strokeWidth={1.5} /> : <IconLock size={14} strokeWidth={1.5} />, () => ids.forEach(id => engine?.toggleLockNode?.(id)))}
      {action(node?.visible === false ? "show" : "hide", node?.visible === false ? <IconEyeOff size={14} strokeWidth={1.5} /> : <IconEye size={14} strokeWidth={1.5} />, () => editAll({
            visible: node?.visible === false
          }))}
      {action("delete", <IconTrash size={14} strokeWidth={1.5} />, () => engine?.deleteSelected?.(), {
            shortcut: "⌫"
          })}
      {node?.kind === "canvasInstance" && onDetachInstance ? action("detach-instance", <IconUnlink size={14} strokeWidth={1.5} />, () => onDetachInstance(node.id), {
            label: t("editor.component.detach")
          }) : onCreateComponent ? action("create-component", <IconDiamond size={14} strokeWidth={1.5} />, onCreateComponent, {
            label: t("editor.component.create")
          }) : null}
      <Divider />{ai}
      </>}
    </>}
    </div>
    {adjustOpen && <div className="absolute bottom-full right-0 z-50 mb-2"><AddKindPicker isImage bitmap={getBitmap?.(node) ?? null} imageKey={node?.imageId ?? node?.src ?? null} adjustments={node?.adjustments ?? null} showEffects onPick={(kind, effect) => {
        onAddAdjustmentLayer?.(kind, effect);
        setAdjustOpen(false);
      }} onApplyPreset={preset => {
        onApplyPreset?.(preset);
        setAdjustOpen(false);
      }} onClose={() => setAdjustOpen(false)} side="top" /></div>}
    {moreOpen && <div className="absolute bottom-full right-0 z-50 mb-2 w-56 rounded-xl border border-white/10 bg-neutral-900 p-2 shadow-pop"><EditorAiMenuSection onOutpaint={onOutpaint} onUpscale={onUpscale} upscaleBusy={upscaleBusy} onAutoEnhance={onAutoEnhance} onPortraitRetouch={onPortraitRetouch} portraitRetouchBusy={portraitRetouchBusy} onSplitLayers={onSplitLayers} splitLayersBusy={splitLayersBusy} onDone={() => setMoreOpen(false)} />{action("ai-repaint", <IconSparkles size={14} strokeWidth={1.5} />, () => {
        setAiInputOpen(true);
        setMoreOpen(false);
      }, {
        label: label("repaint")
      })}</div>}
  </nav>;
  return mobilePortal ? createPortal(toolbar, mobilePortal) : toolbar;
}
export default memo(EditorContextualTaskBar);
