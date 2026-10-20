/**
 * Fill and stroke colour section: Figma-style split where shapes get both,
 * strokes/lines get the stroke alone, and text gets the fill alone.
 */

import PropTypes from "prop-types";
import { Swatch, HexField, HEX_COLOUR, parseHex } from "./colour_swatch.jsx";
import { FillSection } from "./colour_fill_section.jsx";
import { StrokeSection } from "./colour_stroke_section.jsx";

export { Swatch, HexField, FillSection, StrokeSection, HEX_COLOUR, parseHex };

/**
 * Fill and stroke, the Figma split: shapes get both, brush/arrow strokes get
 * the stroke alone, text gets the fill alone.
 */
export default function ColourSection({
  object,
  edit,
  editAndCommit,
  commitNow = undefined,
  selectedNodes = [],
  getBitmap = null,
}) {
  return (
    <>
      <FillSection
        object={object}
        edit={edit}
        editAndCommit={editAndCommit}
        commitNow={commitNow}
        selectedNodes={selectedNodes}
        getBitmap={getBitmap}
      />
      <StrokeSection
        object={object}
        edit={edit}
        editAndCommit={editAndCommit}
        commitNow={commitNow}
        selectedNodes={selectedNodes}
      />
    </>
  );
}

ColourSection.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  /** Selected node objects when several are picked (plan 1.9). */
  selectedNodes: PropTypes.array,
  getBitmap: PropTypes.func,
};
