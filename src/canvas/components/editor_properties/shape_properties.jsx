/** Shape and arrow tool properties: stroke weight and geometry options. */

import PropTypes from "prop-types";
import {
  TOOL,
  BRUSH_WIDTH_MIN,
  BRUSH_WIDTH_MAX,
} from "../../editor/editor_constants.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";

export default function ShapeProperties({
  tool,
  strokeWidth = 1,
  onStrokeWidth,
  brushWidth,
  onBrushWidth,
}) {
  const { t } = useI18n();
  const width = brushWidth ?? strokeWidth;
  const setWidth = onBrushWidth ?? onStrokeWidth;

  const sectionTitle =
    tool === TOOL.ARROW
      ? t("editor.tool.arrow")
      : tool === TOOL.LINE
        ? t("editor.tool.line")
        : t("editor.shape.title");

  return (
    <StaticSection title={sectionTitle}>
      <div className="space-y-1.5">
        {setWidth && (
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField
              prefix={
                <svg
                  className="w-3.5 h-3.5 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="3,19 21,19 21,5" />
                </svg>
              }
              min={BRUSH_WIDTH_MIN}
              max={BRUSH_WIDTH_MAX}
              value={width}
              onValueChange={(val) => setWidth(val)}
              ariaLabel={t("editor.strokeStyle.weight")}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
          </div>
        )}
      </div>
    </StaticSection>
  );
}

ShapeProperties.propTypes = {
  tool: PropTypes.string,
  strokeWidth: PropTypes.number,
  onStrokeWidth: PropTypes.func,
  brushWidth: PropTypes.number,
  onBrushWidth: PropTypes.func,
};
