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
  docSize = null,
  pageColours = [],
  onSelectPageColour = null,
}) {
  const { t } = useI18n();
  const currentBg = backgroundColor || "#262626";

  return (
    <div className="space-y-2 px-1 py-1">
      {docSize && Number.isFinite(docSize.width) && Number.isFinite(docSize.height) ? (
        <EditorField label={t("editor.frame.size")} compact>
          <div className="flex h-7 items-center rounded-xl bg-neutral-800 px-2.5 text-[11px] font-mono tabular-nums text-neutral-200">
            {Math.round(docSize.width)} × {Math.round(docSize.height)}
          </div>
        </EditorField>
      ) : null}
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
      {pageColours.length > 0 ? (
        <div className="flex flex-col gap-2 pt-1">
          <div className="px-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-400">
            {t("editor.props.pageColors")}
          </div>
          {pageColours.map((entry) => (
            <button
              key={entry.colour}
              type="button"
              onClick={() => onSelectPageColour?.(entry.nodes)}
              title={t("editor.props.selectLayersUsingColour")}
              className="flex min-h-7 items-center gap-2 rounded-xl bg-neutral-800 px-2.5 text-left transition-colors hover:bg-neutral-800/80"
            >
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20"
                style={{ backgroundColor: entry.colour }}
              />
              <span className="min-w-0 flex-1 truncate text-[11px] font-mono uppercase text-neutral-200">
                {entry.colour}
              </span>
              <span className="shrink-0 text-[10px] font-mono tabular-nums text-neutral-400">
                ×{new Set(entry.nodes).size}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

BackgroundSection.propTypes = {
  backgroundColor: PropTypes.string,
  onSetBackgroundColor: PropTypes.func,
  docSize: PropTypes.shape({
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  /** Unique paint colours on the page, for "On this page". */
  pageColours: PropTypes.arrayOf(
    PropTypes.shape({
      colour: PropTypes.string.isRequired,
      nodes: PropTypes.arrayOf(PropTypes.string).isRequired,
    }),
  ),
  onSelectPageColour: PropTypes.func,
};
