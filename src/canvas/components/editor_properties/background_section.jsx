import { useId, useState } from "react";
import { MousePointer2 } from "lucide-react";
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
  const [expandedColour, setExpandedColour] = useState(null);
  const detailsId = useId();
  const expandedEntry = pageColours.find(
    (entry) => entry.colour === expandedColour,
  );
  const currentBg = backgroundColor || "#262626";

  return (
    <div className="space-y-2 px-1 py-1">
      {docSize &&
      Number.isFinite(docSize.width) &&
      Number.isFinite(docSize.height) ? (
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
          <div
            className="flex flex-wrap gap-2"
            onKeyDown={(event) => {
              if (event.key === "Escape") setExpandedColour(null);
            }}
          >
            {pageColours.map((entry) => (
              <button
                key={entry.colour}
                type="button"
                aria-label={`${entry.colour} ×${new Set(entry.nodes).size}`}
                title={`${entry.colour} ×${new Set(entry.nodes).size}`}
                aria-expanded={expandedEntry?.colour === entry.colour}
                aria-controls={
                  expandedEntry?.colour === entry.colour ? detailsId : undefined
                }
                onClick={() =>
                  setExpandedColour((current) =>
                    current === entry.colour ? null : entry.colour,
                  )
                }
                className={`size-7 shrink-0 rounded-lg border border-white/20 transition-shadow hover:ring-1 hover:ring-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7ffd4] [@media(pointer:coarse)]:size-12 ${expandedEntry?.colour === entry.colour ? "ring-2 ring-[#a7ffd4]" : ""}`}
                style={{ backgroundColor: entry.colour }}
              />
            ))}
          </div>
          {expandedEntry && (
            <div
              id={detailsId}
              onKeyDown={(event) => {
                if (event.key === "Escape") setExpandedColour(null);
              }}
            >
              <button
                type="button"
                onClick={() =>
                  onSelectPageColour?.([...new Set(expandedEntry.nodes)])
                }
                title={t("editor.props.selectLayersUsingColour")}
                aria-label={`${t("editor.props.selectLayersUsingColour")} ${expandedEntry.colour}`}
                className="flex min-h-7 w-full items-center gap-2 rounded-xl bg-neutral-800 px-2.5 text-left transition-colors hover:bg-neutral-800/80 [@media(pointer:coarse)]:min-h-12"
              >
                <span className="min-w-0 flex-1 truncate text-[11px] font-mono uppercase text-neutral-200">
                  {expandedEntry.colour}
                </span>
                <span className="shrink-0 text-[10px] font-mono tabular-nums text-neutral-400">
                  ×{new Set(expandedEntry.nodes).size}
                </span>
                <MousePointer2
                  size={14}
                  className="shrink-0 text-neutral-400"
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
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
