/** Text creation uses the same labelled typography controls as text editing. */
import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from "../../editor/scene_model_core.js";
import TypographyBasics from "./text-typography-basics.jsx";

export default function TextToolProperties({
  fontFamily = DEFAULT_FONT_FAMILY,
  onFontFamily,
  fontWeight = 400,
  onFontWeight,
  fontSize = DEFAULT_FONT_SIZE,
  onFontSize,
  italic = false,
  onItalic,
  underline = false,
  onUnderline,
  align = "left",
  onAlign,
  lineHeight = 1.25,
  onLineHeight,
  letterSpacing = 0,
  onLetterSpacing,
}) {
  const { t } = useI18n();
  const object = { fontFamily, fontWeight, fontSize, italic, underline, align, lineHeight, letterSpacing };
  const callbacks = {
    fontFamily: onFontFamily,
    fontWeight: onFontWeight,
    fontSize: onFontSize,
    italic: onItalic,
    underline: onUnderline,
    align: onAlign,
    lineHeight: onLineHeight,
    letterSpacing: onLetterSpacing,
  };
  const updateDefaults = (patch) => {
    for (const [key, value] of Object.entries(patch)) callbacks[key]?.(value);
  };
  return (
    <StaticSection title={t("editor.props.textStyle")}>
      <div data-testid="text-tool-typography">
        <TypographyBasics
          object={object}
          edit={updateDefaults}
          editAndCommit={updateDefaults}
          minFontSize={6}
          letterSpacingBounds={{ min: -10, max: 40 }}
        />
      </div>
    </StaticSection>
  );
}

TextToolProperties.propTypes = {
  fontFamily: PropTypes.string,
  onFontFamily: PropTypes.func,
  fontWeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onFontWeight: PropTypes.func,
  fontSize: PropTypes.number,
  onFontSize: PropTypes.func,
  italic: PropTypes.bool,
  onItalic: PropTypes.func,
  underline: PropTypes.bool,
  onUnderline: PropTypes.func,
  align: PropTypes.string,
  onAlign: PropTypes.func,
  lineHeight: PropTypes.number,
  onLineHeight: PropTypes.func,
  letterSpacing: PropTypes.number,
  onLetterSpacing: PropTypes.func,
};
