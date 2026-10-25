import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconAdd, IconBold, IconCheck, IconClose, IconCopy, IconFlipH, IconFlipV, IconFolder, IconLayers, IconLock, IconMask, IconMinus, IconMore, IconSliders, IconSwap, IconTrash, IconUnlock, IconUnlink, IconDiamond, IconSparkles, IconEye, IconEyeOff, IconArrowUp, IconCrop } from "../icons.jsx";
import { OperationIcon } from "./editor_properties/combine_section.jsx";
import { AlignIcon, DistributeIcon } from "./editor_properties/align_section.jsx";
import { alignNodes, distributeNodes } from "../editor/align_ops.js";
import { BOOLEAN_OPERATIONS } from "../editor/scene_model.js";
import AddKindPicker from "./editor_properties/add_kind_picker.jsx";
import EditorTooltip from "./editor_tooltip.jsx";
import { EditorAiMenuSection } from "./editor_ai_taskbar_buttons.jsx";
import { clearActivePixelSelection, finishPenPathEditing } from "./editor_taskbar_actions.js";
import EditorContextualAiInput, { extractNodeContext, dispatchToAgent } from "./editor_contextual_ai_input.jsx";
import { useI18n } from "../use_i18n.js";
import { TOOL } from "../editor/editor_constants.js";
import { EDITOR_PAGE_TOOLBAR_GAP } from "./editor_panel_layout.js";
export { extractNodeContext, dispatchToAgent };
const BUTTON = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4] disabled:opacity-40";
function Divider() {
  return <span aria-hidden="true" className="mx-1 h-3.5 w-[1px] shrink-0 bg-white/15" />;
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
export function clampQuickbar(docRect, width, height, viewportWidth, viewportHeight, bottomTop) {
  const half = Math.min(width, viewportWidth - 16) / 2;
  const ceiling = Math.min(viewportHeight - 64, bottomTop ?? Infinity) - 8 - height;
  return {
    left: Math.max(8 + half, Math.min(docRect.x + docRect.width / 2, viewportWidth - 8 - half)),
    top: Math.max(8, Math.min(docRect.y + docRect.height + EDITOR_PAGE_TOOLBAR_GAP, ceiling))
  };
}

export function reorderSelection(engine, ids, direction) {
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
  const pen = tool === TOOL.PEN || Boolean(engine?.penEdit);
  const selectionTool = tool === TOOL.MARQUEE || tool === TOOL.LASSO;
  const active = Boolean(node || count || hasSelection || transforming || pen || selectionTool);
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
    if (!docRect || !active) return;
    const place = () => {
      const bar = barRef.current;
      const bottom = document.querySelector('[data-testid="editor-bottom-toolbar"]')?.getBoundingClientRect();
      const parent = bar?.offsetParent?.getBoundingClientRect();
      const origin = {
        x: parent?.left || 0,
        y: parent?.top || 0
      };
      const next = clampQuickbar({
        ...docRect,
        x: docRect.x + origin.x,
        y: docRect.y + origin.y
      }, bar?.offsetWidth || 400, bar?.offsetHeight || 38, window.innerWidth, window.innerHeight, bottom?.top);
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
  }, [docRect, active, selectionKey, aiInputOpen, type]);
  if (!active) return null;
  const action = (id, icon, onClick, extra = {}) => <Action key={id} id={id} label={label(id)} icon={icon} onClick={onClick} {...extra} />;
  const booleanActions = engine?.canCombineSelection?.() ? BOOLEAN_OPERATIONS.map(op => <Action key={op} id={`boolean-${op}`} label={t(`editor.props.combine.${op}`)} icon={<OperationIcon operation={op} />} onClick={() => engine?.combineSelected?.(op)} />) : null;
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
  const ai = <>{action("ai-sparkle", <IconSparkles size={14} className="text-neutral-300" />, () => setAiInputOpen(open => !open), {
      label: label("askAgent"),
      active: aiInputOpen,
      "aria-expanded": aiInputOpen
    })}{aiInputOpen && <EditorContextualAiInput selectedNode={node} autoFocus placeholder={label("askPlaceholder")} inputTestId="editor-taskbar-ai-input" submitTestId="editor-taskbar-ai-submit" onClose={() => setAiInputOpen(false)} onDispatch={(prompt, context) => {
      if (hasSelection) onRepaint?.(prompt);
      dispatch(prompt, context);
    }} />}</>;
  const fontSize = Number(node?.fontSize) || 16;
  return <nav ref={barRef} data-testid="editor-contextual-taskbar" aria-label={label("ariaLabel")} style={docRect ? {
    left: position?.left ?? docRect.x + docRect.width / 2,
    top: position?.top ?? docRect.y + docRect.height + EDITOR_PAGE_TOOLBAR_GAP,
    maxWidth: "calc(100vw - 16px)"
  } : {
    maxWidth: "calc(100vw - 16px)"
  }} className={`pointer-events-auto z-20 flex items-center gap-0.5 rounded-full bg-neutral-900/95 border border-white/10 px-2 py-1 shadow-pop backdrop-blur-md whitespace-nowrap text-[11px] text-neutral-200 select-none ${docRect ? "absolute -translate-x-1/2" : "relative"}`}>
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto" data-testid={`editor-taskbar-${type}-actions`}>
    {transforming ? <>{action("applyTransform", <IconCheck size={14} />, () => engine?.applySelectionTransform?.())}{action("cancelTransform", <IconClose size={14} />, () => engine?.cancelSelectionTransform?.())}</> : hasSelection ? <>{action("transform", <IconCrop size={14} />, () => engine?.beginSelectionTransform?.())}{action("invert", <IconSwap size={14} />, () => engine?.invertPixelSelection?.())}{action("deselect", <IconClose size={14} />, () => clearActivePixelSelection(engine))}<Divider />{ai}</> : <>
      {pen && <>{action("finishPath", <IconCheck size={14} />, () => finishPenPathEditing(engine), { label: t("editor.pen.closeEdit") })}{action("deleteAnchor", <IconTrash size={14} />, () => engine?.deleteActiveAnchor?.())}<Divider /></>}
      {!node && !count && selectionTool ? <>{action("marquee", <IconCrop size={14} />, () => engine?.setTool?.(TOOL.MARQUEE))}{action("lasso", <IconUnlink size={14} />, () => engine?.setTool?.(TOOL.LASSO))}</> : <>
      {type === "text" && <>
        <EditorTooltip title={label("fontFamily")}><select data-testid="editor-taskbar-font-family" aria-label={label("fontFamily")} className="h-7 max-w-24 rounded-lg bg-transparent px-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]" value={node?.fontFamily || "Inter"} onChange={event => edit({
                fontFamily: event.target.value
              })}>{Array.from(new Set([node?.fontFamily || "Inter", "Inter", "Arial", "Georgia", "monospace"])).map(font => <option className="bg-neutral-900" key={font}>{font}</option>)}</select></EditorTooltip>
        {action("fontDecrease", <IconMinus size={14} />, () => edit({
              fontSize: Math.max(1, fontSize - 1)
            }))}
        <input data-testid="editor-taskbar-font-size" aria-label={label("fontSize")} type="number" min="1" max="999" value={fontSize} className="h-7 w-10 rounded-lg bg-white/5 text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]" onChange={event => {
              const value = Number(event.target.value);
              if (value > 0 && value <= 999) edit({
                fontSize: value
              });
            }} />
        {action("fontIncrease", <IconAdd size={14} />, () => edit({
              fontSize: Math.min(999, fontSize + 1)
            }))}
        {action("bold", <IconBold size={14} />, () => edit({
              fontWeight: node?.fontWeight === "bold" || Number(node?.fontWeight) >= 600 ? "normal" : "bold"
            }), {
              active: node?.fontWeight === "bold" || Number(node?.fontWeight) >= 600
            })}
        {["left", "center", "right"].map(align => <Action key={align} id={`text-align-${align}`} label={t(`editor.props.alignShapes.${align}`)} icon={<AlignIcon type={align} />} active={(node?.align || "left") === align} onClick={() => edit({
              align
            })} />)}
      </>}
      {type === "image" && <>
        {action("crop", <IconCrop size={14} />, () => engine?.setTool?.(TOOL.CROP))}
        {action("replace", <IconSwap size={14} />, () => fileRef.current?.click())}
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
        {action("ai-remove-bg", <IconMask size={14} />, () => {
              void removeBackground?.();
            }, {
              label: label("matting"),
              disabled: maskBusy || !removeBackground
            })}
        {action("adjust", <IconSliders size={14} />, () => {
              setAdjustOpen(!adjustOpen);
              setMoreOpen(false);
            }, {
              active: adjustOpen
            })}
        {action("more", <IconMore size={14} />, () => {
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
        {action("flipH", <IconFlipH size={14} />, () => engine?.flipHorizontal?.())}
        {action("flipV", <IconFlipV size={14} />, () => engine?.flipVertical?.())}
      </>}
      {type === "frame" && action("autoLayout", <IconLayers size={14} />, () => edit({
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
      {type === "group" && action("ungroup", <IconUnlink size={14} />, () => engine?.ungroupSelection?.())}
      {type === "multi" && <>
        {["left", "center", "right", "top", "middle", "bottom"].map(align => <Action key={align} id={`align-${align}`} label={t(`editor.props.alignShapes.${align}`)} icon={<AlignIcon type={align} />} onClick={() => engine?.layoutSelection?.(alignNodes, align)} />)}
        {["horizontal", "vertical"].map(axis => <Action key={axis} id={`distribute-${axis}`} label={t(`editor.props.distribute.${axis}`)} icon={<DistributeIcon axis={axis} />} disabled={count < 3 || !engine?.layoutSelection} onClick={() => engine?.layoutSelection?.(distributeNodes, axis)} />)}
        {action("group", <IconFolder size={14} />, () => engine?.groupSelection?.())}{booleanActions}
      </>}
      <Divider />
      {action("bringForward", <IconArrowUp size={14} />, () => reorderSelection(engine, ids, 1))}
      {action("sendBackward", <IconArrowUp size={14} className="rotate-180" />, () => reorderSelection(engine, ids, -1))}
      <Divider />
      {action("duplicate", <IconCopy size={14} />, () => engine?.duplicateSelected?.(), {
            shortcut: typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘D" : "Ctrl+D"
          })}
      {action(node?.locked ? "unlock" : "lock", node?.locked ? <IconUnlock size={14} /> : <IconLock size={14} />, () => ids.forEach(id => engine?.toggleLockNode?.(id)))}
      {action(node?.visible === false ? "show" : "hide", node?.visible === false ? <IconEyeOff size={14} /> : <IconEye size={14} />, () => editAll({
            visible: node?.visible === false
          }))}
      {action("delete", <IconTrash size={14} />, () => engine?.deleteSelected?.(), {
            shortcut: "⌫"
          })}
      {node?.kind === "canvasInstance" && onDetachInstance ? action("detach-instance", <IconUnlink size={14} />, () => onDetachInstance(node.id), {
            label: t("editor.component.detach")
          }) : onCreateComponent ? action("create-component", <IconDiamond size={14} />, onCreateComponent, {
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
    {moreOpen && <div className="absolute bottom-full right-0 z-50 mb-2 w-56 rounded-xl border border-white/10 bg-neutral-900 p-2 shadow-pop"><EditorAiMenuSection onOutpaint={onOutpaint} onUpscale={onUpscale} upscaleBusy={upscaleBusy} onAutoEnhance={onAutoEnhance} onPortraitRetouch={onPortraitRetouch} portraitRetouchBusy={portraitRetouchBusy} onSplitLayers={onSplitLayers} splitLayersBusy={splitLayersBusy} onDone={() => setMoreOpen(false)} />{action("ai-repaint", <IconSparkles size={14} />, () => {
        setAiInputOpen(true);
        setMoreOpen(false);
      }, {
        label: label("repaint")
      })}</div>}
  </nav>;
}
export default memo(EditorContextualTaskBar);
