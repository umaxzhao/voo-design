import PropTypes from "prop-types";
import { useMemo } from "react";

import { useI18n } from "../../use_i18n.js";
import InfoHint from "../info_hint.jsx";
import {
  HISTOGRAM_COLUMNS,
  clipPercentages,
  foldHistogramBins,
  histogramAreaPath,
} from "../../editor/histogram_geometry.js";
import { useLayerHistogram } from "./use_layer_histogram.js";

/**
 * The tones a layer holds, drawn inside the levels and curves panels.
 *
 * It lives there because that is the only place it answers a question the user
 * is already asking ("where are my blacks, and am I clipping?"). No new panel,
 * no new toolbar button: the strip annotates controls that already exist, and
 * it disappears when the layer has no bitmap to measure.
 *
 * Shape only, one channel per row: overlaid channels in one box are only
 * readable in colour, and this palette has no room for three more hues.
 * Semantic colour is carried by the clipping figures instead, where it means
 * "this end of the range is already gone".
 */
export default function HistogramStrip({ bitmap = null, className = "" }) {
  const stats = useLayerHistogram(bitmap);
  if (!stats) return null;
  return <HistogramView stats={stats} className={className} />;
}

/**
 * The strip itself: one measured `computeImageStats()` result in, four channel
 * rows and the clipping readout out. Split from the measuring above so the
 * drawing can be rendered — and asserted on — without a bitmap, a canvas or a
 * running effect.
 */
export function HistogramView({ stats, className = "" }) {
  const { t } = useI18n();

  // Four rows, one per channel. Recomputed only when the analysis changes.
  const rows = useMemo(() => {
    return [
      { key: "r", labelKey: "editor.props.cmRed", histogram: stats.channels.r.histogram },
      { key: "g", labelKey: "editor.props.cmGreen", histogram: stats.channels.g.histogram },
      { key: "b", labelKey: "editor.props.cmBlue", histogram: stats.channels.b.histogram },
      { key: "luma", labelKey: "editor.histogram.luma", histogram: stats.channels.luma.histogram, primary: true },
    ].map((row) => ({
      ...row,
      path: histogramAreaPath(foldHistogramBins(row.histogram, HISTOGRAM_COLUMNS)),
    }));
  }, [stats]);

  const clip = clipPercentages(stats.clipping.luma);
  const clipTone = (percent) =>
    percent > 0 ? "text-amber-400" : "text-neutral-500";

  return (
    <div className={`rounded-xl bg-[#181818] p-2 ${className}`}>
      <InfoHint
        label={t("editor.histogram.ariaLabel")}
        text={t("editor.histogram.hint")}
        className="mb-1.5 text-[10px] uppercase tracking-wide text-neutral-400"
      />

      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-[9px] uppercase tracking-wide text-neutral-500">
              {t(row.labelKey)}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className={`w-full ${row.primary ? "h-6 text-neutral-300" : "h-3.5 text-neutral-500"}`}
            >
              {row.path ? (
                <path d={row.path} fill="currentColor" fillOpacity={row.primary ? 0.7 : 0.5} />
              ) : (
                <line
                  x1="0"
                  y1="100"
                  x2="100"
                  y2="100"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeOpacity="0.4"
                />
              )}
            </svg>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[9px] uppercase tracking-wide text-neutral-500">
        <span>
          {t("editor.histogram.clipLow")}{" "}
          <span className={`tabular-nums ${clipTone(clip.shadow)}`}>{clip.shadow}%</span>
        </span>
        <span>
          {t("editor.histogram.clipHigh")}{" "}
          <span className={`tabular-nums ${clipTone(clip.highlight)}`}>{clip.highlight}%</span>
        </span>
      </div>
    </div>
  );
}

HistogramStrip.propTypes = {
  /** The decoded layer image; null renders nothing, by design. */
  bitmap: PropTypes.object,
  className: PropTypes.string,
};

HistogramView.propTypes = {
  /** A `computeImageStats()` result. */
  stats: PropTypes.object.isRequired,
  className: PropTypes.string,
};
