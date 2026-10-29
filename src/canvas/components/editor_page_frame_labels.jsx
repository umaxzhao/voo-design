import React from "react";
import PropTypes from "prop-types";
import { visibleCanvasFrameLabels } from "../editor/frame-canvas-labels.js";
import { docToScreenRect } from "../editor/scene_renderer.js";
import { EDITOR_PAGE_HEADER_INSET } from "./editor_panel_layout.js";
import { FRAME_TITLE_HIT_AREA } from "./editor_page_title.jsx";
import { IconFrame } from "../icons.jsx";

export default function EditorPageFrameLabels({ page }) {
  const { doc, viewport, canvasFrameLabelRefs, t } = page;
  const canvasFrameLabels = visibleCanvasFrameLabels(doc);
  return canvasFrameLabels.map((frame) => {
      const frameRect = docToScreenRect(frame, viewport);
      return (
        <div
          key={frame.id}
          ref={(element) => {
            if (element) canvasFrameLabelRefs.current.set(frame.id, element);
            else canvasFrameLabelRefs.current.delete(frame.id);
          }}
          data-testid="editor-canvas-frame-label"
          data-frame-id={frame.id}
          className={`pointer-events-auto absolute z-40 ${FRAME_TITLE_HIT_AREA} flex max-w-[70%] cursor-pointer items-center gap-1.5 text-[11px] font-mono leading-none text-neutral-400`}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            page.engine?.selectExactly?.([frame.id]);
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
            className="shrink-0 text-neutral-400"
            aria-hidden="true"
          />
          <span className="truncate">
            {frame.name || t("editor.prototype.untitledFrame")}
          </span>
        </div>
      );
    });
}
EditorPageFrameLabels.propTypes = { page: PropTypes.object.isRequired };
