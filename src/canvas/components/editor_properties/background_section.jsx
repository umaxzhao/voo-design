import PropTypes from "prop-types";
import { EditorField } from "../editor_controls.jsx";
import { useI18n } from "../../use_i18n.js";

const BG_SWATCHES = [
  "transparent",
  "#ffffff",
  "#d4d4d4",
  "#a3a3a3",
  "#737373",
  "#525252",
  "#262626",
  "#000000",
];

/** Checkerboard fill that marks the transparent swatch. */
const CHECKER_IMAGE =
  "linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)";

/** The panel body shown when the document background itself is selected. */
export default function BackgroundSection({
  backgroundColor = "#262626",
  onSetBackgroundColor = null,
}) {
  const { t } = useI18n();
  const currentBg = backgroundColor || "#262626";

  return (
    <div className="px-1 py-1">
      <EditorField label={t("editor.props.bgColor")} compact>
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {BG_SWATCHES.map((swatch) => {
              const transparent = swatch === "transparent";
              return (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => onSetBackgroundColor?.(swatch)}
                  aria-label={
                    transparent ? t("editor.layer.transparent") : swatch
                  }
                  aria-pressed={currentBg === swatch}
                  title={transparent ? t("editor.layer.transparent") : swatch}
                  className={`h-5 w-5 shrink-0 rounded-full transition-transform ${
                    currentBg === swatch
                      ? "scale-110 ring-2 ring-white"
                      : "hover:scale-105"
                  }`}
                  style={{
                    backgroundColor: transparent ? "transparent" : swatch,
                    backgroundImage: transparent ? CHECKER_IMAGE : undefined,
                    backgroundSize: transparent ? "8px 8px" : undefined,
                    backgroundPosition: transparent
                      ? "0 0, 0 4px, 4px -4px, -4px 0px"
                      : undefined,
                  }}
                />
              );
            })}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={
                currentBg.startsWith("#") && currentBg.length === 7
                  ? currentBg
                  : "#ffffff"
              }
              onChange={(event) => onSetBackgroundColor?.(event.target.value)}
              aria-label={t("editor.props.bgColor")}
              className="h-6 w-8 cursor-pointer rounded-lg bg-transparent p-0 border-0"
            />
            <span className="text-[11px] text-neutral-300 font-mono">
              {currentBg}
            </span>
          </div>
        </div>
      </EditorField>
    </div>
  );
}

BackgroundSection.propTypes = {
  backgroundColor: PropTypes.string,
  onSetBackgroundColor: PropTypes.func,
};
