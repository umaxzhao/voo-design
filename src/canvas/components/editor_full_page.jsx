import React from "react";
import PropTypes from "prop-types";
import EditorCanvasPresets from "./editor_canvas_presets.jsx";
import EditorPageTitle, { FRAME_TITLE_HIT_AREA } from "./editor_page_title.jsx";
import EditorContextualTaskBarSlot from "./editor_contextual_taskbar_slot.jsx";
import { EDITOR_PAGE_HEADER_INSET, EDITOR_PAGE_TOOLBAR_GAP } from "./editor_panel_layout.js";
import { IconAdd, IconFrame } from "../icons.jsx";
import LoadingModal from "./loading_modal.jsx";
import { effectivePage } from "../editor/scene_model.js";
import { docToScreenRect } from "../editor/scene_renderer.js";

/** Bounded-page DOM keeps independent full-mode canvases and camera-bound chrome. */
export default function EditorFullPage({ page }) {
  const {
    doc, viewport, rootRef, nodeId,
    onFocus, stageRef, releaseNestedPointerFocus, finishAdjustmentOutside,
    handleAdjustmentKey, openInstanceAtPoint, canvases, streamingContent,
    streamRectRef, ready, pageError, t,
    retryPage, readOnly, pageRingRef, titleRef,
    focused, startRename, iconTone, renaming,
    setRenaming, title, onRenamePage, componentUses,
    pageSizeRef, engine, contextualTaskBarProps, onAddCanvas,
    isLast, canvasType, addCanvasRef, overlays,
    frameLabels,
  } = page;
  const docRect = doc ? docToScreenRect(effectivePage(doc), viewport) : null;

  // A single picture keeps the stage it always had, with no page chrome
  // to explain.
  return (
    <section
      ref={rootRef}
      data-testid="editor-page"
      data-node-id={nodeId}
      onPointerDownCapture={() => onFocus(nodeId)}
      // isolate: keep this page's chrome z-indexes below the floating panels.
      className="relative isolate flex h-full w-full flex-col overflow-hidden"
    >
      <div
        ref={stageRef}
        onPointerDownCapture={releaseNestedPointerFocus}
        onClickCapture={finishAdjustmentOutside}
        onKeyDownCapture={handleAdjustmentKey}
        onDoubleClickCapture={openInstanceAtPoint}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
      >
        {canvases}
        {streamingContent && docRect ? (
          <div
            ref={streamRectRef}
            className="pointer-events-none absolute z-10 overflow-hidden"
            style={{
              left: docRect.x,
              top: docRect.y,
              width: docRect.width,
              height: docRect.height,
            }}
          >
            {streamingContent}
          </div>
        ) : null}

        {/* Big-image open state: a spinner while the engine decodes, and an
            error bar with Retry when the picture failed to land (the engine
            resolves with a blank document instead of rejecting). */}
        {!ready && !pageError ? (
          <div
            data-testid="editor-page-loading"
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          >
            <LoadingModal label={t("editor.open.loading")} />
          </div>
        ) : null}

        {pageError ? (
          <div
            data-testid="editor-page-error"
            className="absolute inset-x-0 top-0 z-40 flex items-center justify-center gap-3 bg-rose-500/10 px-4 py-2 text-[11px] text-rose-400"
          >
            <span>{t("editor.open.failed")}</span>
            <button
              type="button"
              onClick={retryPage}
              className="rounded-lg bg-rose-500/10 px-2 py-0.5 text-rose-400 hover:bg-rose-500/20"
            >
              {t("editor.open.retry")}
            </button>
          </div>
        ) : null}

        {docRect && !readOnly ? (
          <>
            <div
              ref={pageRingRef}
              aria-hidden
              className="pointer-events-none absolute ring-1 ring-white/15"
              style={{
                left: docRect.x,
                top: docRect.y,
                width: docRect.width,
                height: docRect.height,
              }}
            />
            {/* Page header: frame icon + title + canvas-type switch, pinned to the
                artboard's top-left so the mode is read and changed in one
                place instead of from a footer under the canvas. */}
            <div
              ref={titleRef}
              data-testid="editor-page-title"
              data-editor-artboard-title
              hidden={doc?.isCanvasRoot}
              // Same full-width bar as a frame on the free canvas.
              className={`absolute z-20 ${FRAME_TITLE_HIT_AREA} flex max-w-[70%] items-center gap-1.5 text-[11px] font-mono leading-none transition-colors ${
                focused ? "text-[#a7ffd4]" : "text-neutral-400 hover:text-neutral-200"
              }`}
              // Keep title gestures out of the stage's native pointer capture.
              // Otherwise the second click is retargeted and rename never starts.
              onPointerDownCapture={(event) => event.stopPropagation()}
              onDoubleClick={startRename}
              style={{
                left: docRect.x,
                top: docRect.y - EDITOR_PAGE_HEADER_INSET,
                display: doc?.isCanvasRoot ? "none" : undefined,
              }}
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
                                        </div>
            {/* Canvas size presets sit above the artboard. The bottom padding
                is the only space under the pill inside this box: pb-px (1px,
                was pb-2 = 8px) halves the visible gap to the page header from
                14px to 7px (1px padding + 6px header hit-area padding). */}
            <div
              ref={pageSizeRef}
              data-testid="editor-page-size"
              className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-1 text-[10px] font-mono pb-px"
              style={{
                left: docRect.x + docRect.width / 2,
                top: docRect.y - EDITOR_PAGE_HEADER_INSET - EDITOR_PAGE_TOOLBAR_GAP,
              }}
            >
              <EditorCanvasPresets engine={engine} doc={doc} />
            </div>

            <EditorContextualTaskBarSlot
              {...contextualTaskBarProps}
              focused={focused}
              docRect={docRect}
            />

            {/* The single 3D frame adds canvases from the unobstructed zoom toolbar. */}
            {onAddCanvas && isLast && canvasType !== "3d" ? (
              <button
                type="button"
                ref={addCanvasRef}
                data-testid="editor-add-canvas-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddCanvas(nodeId);
                }}
                title={t("editor.addCanvas")}
                className="group/add-canvas absolute z-40 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#2a2a2a]/80 text-white/80 backdrop-blur-md transition-colors hover:bg-white hover:text-black"
                style={{
                  left: docRect.x + docRect.width + 24,
                  top: docRect.y + docRect.height / 2,
                }}
              >
                <IconAdd size={18} />
              </button>
            ) : null}
          </>
        ) : null}


        {overlays}
      </div>
      {frameLabels}
    </section>
  );
}
EditorFullPage.propTypes = { page: PropTypes.object.isRequired };
