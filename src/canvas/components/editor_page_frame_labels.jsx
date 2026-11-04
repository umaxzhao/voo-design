import React from "react";
import PropTypes from "prop-types";
import { visibleCanvasFrameLabels } from "../editor/frame-canvas-labels.js";
import { docToScreenRect } from "../editor/scene_renderer.js";
import { EDITOR_PAGE_HEADER_INSET } from "./editor_panel_layout.js";
import { FRAME_TITLE_HIT_AREA } from "./editor_page_title.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { IconFrame } from "../icons.jsx";

export default function EditorPageFrameLabels({ page }) {
  const { doc, viewport, canvasFrameLabelRefs, selectedIds = [], t } = page;
  const canvasFrameLabels = visibleCanvasFrameLabels(doc);
  // The name label is Select-tool chrome. While a drawing tool is armed it
  // must not swallow the first press over the Frame's top edge: the engine
  // owns that point (pen anchor, new Frame, marquee).
  const chromeTool = page.sharedTool ?? page.tool ?? page.engine?.getTool?.() ?? TOOL.SELECT;
  const interactive = chromeTool === TOOL.SELECT;
  return canvasFrameLabels.map((frame) => {
    const frameRect = docToScreenRect(frame, viewport);
    return (
      <button
        type="button"
        key={frame.id}
        ref={(element) => {
          if (element) canvasFrameLabelRefs.current.set(frame.id, element);
          else canvasFrameLabelRefs.current.delete(frame.id);
        }}
        data-testid="editor-canvas-frame-label"
        data-frame-id={frame.id}
        aria-pressed={selectedIds.includes(frame.id)}
        tabIndex={interactive ? 0 : -1}
        className={`${interactive ? "pointer-events-auto cursor-move" : "pointer-events-none cursor-default"} absolute z-40 ${FRAME_TITLE_HIT_AREA} flex max-w-[70%] touch-none items-center gap-1.5 text-left text-[11px] font-mono leading-none ${selectedIds.includes(frame.id) ? "text-[#a7ffd4]" : "text-neutral-400"}`}
        onPointerDown={(event) => {
          if (!interactive) return;
          const liveTool = page.engine?.getTool?.() ?? chromeTool;
          if (liveTool !== TOOL.SELECT) return;
          event.stopPropagation();
          if (event.button !== 0) return;
          if (!page.engine?.isSelected?.(frame.id)) page.engine?.selectExactly?.([frame.id]);
          if (!page.readOnly) page.engine?.beginFrameMove?.(frame.id, event);
        }}
        onClick={(event) => {
          if (!interactive) return;
          event.stopPropagation();
          if (!page.engine?.isSelected?.(frame.id)) page.engine?.selectExactly?.([frame.id]);
        }}
        style={{
          left: frameRect.x,
          top: frameRect.y - EDITOR_PAGE_HEADER_INSET,
        }}
      >
        <IconFrame
          data-testid="editor-canvas-frame-icon"
          size={12}
          strokeWidth={1.5}
          className="shrink-0"
          aria-hidden="true"
        />
        <span className="truncate">
          {frame.name || t("editor.prototype.untitledFrame")}
        </span>
      </button>
    );
  });
}
EditorPageFrameLabels.propTypes = { page: PropTypes.object.isRequired };
