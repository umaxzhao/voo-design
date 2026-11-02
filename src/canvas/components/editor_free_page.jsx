import React from "react";
import PropTypes from "prop-types";
import EditorCanvasPresets from "./editor_canvas_presets.jsx";
import EditorPageTitle, { FRAME_TITLE_HIT_AREA } from "./editor_page_title.jsx";
import EditorContextualTaskBarSlot from "./editor_contextual_taskbar_slot.jsx";
import { EDITOR_PAGE_HEADER_INSET, EDITOR_PAGE_TOOLBAR_GAP } from "./editor_panel_layout.js";
import { IconAdd, IconFrame } from "../icons.jsx";

/** Shared-camera artboard DOM; artwork remains owned by the workspace renderer. */
export default function EditorFreePage({ page }) {
  const {
    rootRef, nodeId, onFocus, onBodyPointerDown,
    focused, rect, stageRef, releaseNestedPointerFocus,
    finishAdjustmentOutside, handleAdjustmentKey, openInstanceAtPoint, doc,
    free, workspaceRendererReady, canvases, streamingContent,
    overlays, active, frameLabels, titleRef,
    pageTitleActions, titlePanHandlers, startRename, t,
    iconTone, renaming, setRenaming, title,
    onRenamePage, componentUses, ready, engine,
    contextualTaskBarProps, onAddCanvas, isLast,
  } = page;
    // An artboard on the shared free canvas. The outer div carries the camera
    // transform and the (thin, focused-only) frame; the inner stage owns the
    // canvas and the engine's pointer surface. The name label floats above the
    // board, outside the clipping stage.
    return (
      <div
        ref={rootRef}
        data-editor-artboard
        data-testid="editor-page"
        data-node-id={nodeId}
        onPointerDownCapture={(event) => {
          onFocus(nodeId);
          onBodyPointerDown?.(event);
        }}
        // isolate: the frame's own z-index ladder (header, tool row, add
        // button) stays inside the frame, so floating panels (z-30) always
        // cover it. The focused frame sits above its neighbours so its menus
        // are not hidden by the next frame.
        className={`group/artboard isolate absolute pointer-events-auto ${focused ? "z-10" : "z-0"}`}
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
        }}
      >
        <div
          ref={stageRef}
          onPointerDownCapture={releaseNestedPointerFocus}
          onClickCapture={finishAdjustmentOutside}
          onKeyDownCapture={handleAdjustmentKey}
          onDoubleClickCapture={openInstanceAtPoint}
          className={`absolute inset-0 touch-none ${doc?.isCanvasRoot ? "overflow-visible" : "overflow-hidden"} transition-colors ${
            doc?.isCanvasRoot
              ? ""
              : free && workspaceRendererReady
                ? focused
                  ? ""
                  : "ring-1 ring-white/10"
                : focused
                  ? "ring-1 ring-[#b2ffd6]/60"
                  : "ring-1 ring-white/10"
          }`}
          style={{
            borderRadius: doc?.cornerRadius ? `${doc.cornerRadius}px` : undefined,
            outline: !doc?.isCanvasRoot && doc?.stroke && doc?.strokeWidth
              ? `${doc.strokeWidth}px solid ${doc.stroke}`
              : undefined,
          }}
        >
          {canvases}
          {streamingContent ? (
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
              {streamingContent}
            </div>
          ) : null}
          {focused ? (
            <div aria-hidden className="pointer-events-none absolute inset-0" />
          ) : null}
          {overlays}
                    {!active ? (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-neutral-500">
              …
            </div>
          ) : null}
        </div>
        {frameLabels}
        <div
          ref={titleRef}
          data-testid="editor-page-title"
          data-editor-artboard-title
          hidden={doc?.isCanvasRoot}
          style={{ top: -EDITOR_PAGE_HEADER_INSET, display: doc?.isCanvasRoot ? "none" : undefined }}
          // A full-width bar over the frame: name at the left, the canvas-type
          // switch at the right. The focused frame's bar is tinted with its
          // type colour; the others show just the name.
          className={`absolute left-0 ${FRAME_TITLE_HIT_AREA} ${pageTitleActions ? "z-40" : ""} flex max-w-full items-center gap-1.5 text-[11px] font-mono leading-none transition-colors ${
            focused ? "text-[#a7ffd4]" : "text-neutral-400 hover:text-neutral-200"
          } ${titlePanHandlers ? "cursor-grab touch-none" : "cursor-pointer"}`}
          {...titlePanHandlers}
          onDoubleClick={startRename}
        >
          <span
            data-testid="editor-frame-header-icon"
            aria-label={t(iconTone.label)}
            className={`flex shrink-0 items-center transition-colors ${
              focused ? "text-neutral-200" : iconTone.text
            }`}
          >
            <IconFrame size={12} strokeWidth={1.5} />
          </span>
          <EditorPageTitle
            editing={renaming}
            onEditingChange={setRenaming}
            title={title}
            onRename={
              onRenamePage ? (name) => onRenamePage(nodeId, name) : null
            }
          />
          {componentUses > 0 ? (
            <span
              data-testid="editor-component-uses"
              className={`shrink-0 ${focused ? "text-neutral-400" : "text-neutral-500"}`}
            >
              {t("editor.component.uses", { count: componentUses })}
            </span>
          ) : null}
                              {pageTitleActions}
        </div>
        {focused && ready && !doc?.isCanvasRoot ? (
          <div
            data-testid="editor-page-size"
            className="absolute left-1/2 z-40 flex -translate-x-1/2 -translate-y-full items-center pb-px text-[10px] font-mono"
            style={{
              top: -EDITOR_PAGE_HEADER_INSET - EDITOR_PAGE_TOOLBAR_GAP,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <EditorCanvasPresets engine={engine} doc={doc} />
          </div>
        ) : null}
        {doc?.isCanvasRoot ? (
          <EditorContextualTaskBarSlot {...contextualTaskBarProps} focused={focused} floating />
        ) : (
          <div
            data-testid="editor-page-toolbar"
            className="absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-1"
            style={{ top: "calc(100% + 8px)" }}
          >
            <EditorContextualTaskBarSlot {...contextualTaskBarProps} focused={focused} />
          </div>
        )}
        {/* Add Canvas Button in Free Mode - only on the right of the last canvas */}
        {onAddCanvas && isLast && !doc?.isCanvasRoot ? (
          <button
            type="button"
            data-testid="editor-add-canvas-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAddCanvas(nodeId);
            }}
            title={t("editor.addCanvas")}
            className="group/add-canvas absolute -right-12 top-1/2 z-40 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#2a2a2a]/80 text-white/80 backdrop-blur-md transition-colors hover:bg-white hover:text-black"
          >
            <IconAdd size={18} />
          </button>
        ) : null}
      </div>
    );}
EditorFreePage.propTypes = { page: PropTypes.object.isRequired };
