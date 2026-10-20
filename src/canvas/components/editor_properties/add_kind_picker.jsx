import PropTypes from "prop-types";
import AnchoredAdjustmentPicker from "./anchored_adjustment_picker.jsx";
import {
  TONE_ADJUSTMENT_KINDS,
  FILTER_KINDS,
  EFFECT_KINDS,
  adjustmentLabelKey,
  effectLabelKey,
} from "../../editor/adjustment_catalog.js";
import { FILTER_CATEGORIES } from "../../editor/filter_presets.js";
import { useI18n } from "../../use_i18n.js";
import { usePresetThumbs, useActivePresetKey } from "./use_preset_thumbs.js";
import KindIcon from "./kind_icons.jsx";

/** Dot colours, shared with the effects list so a kind keeps its identity. */
const ACCENT = {
  adjustment: "#7fd4a8",
  filter: "#38bdf8",
  effect: "#b3a0ff",
};

/**
 * One tappable kind in the left column. The glyph carries what the kind does
 * and the accent carries which group it belongs to, so the row needs no dot.
 */
function KindButton({ kind, accent, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl bg-neutral-800 px-2.5 py-1.5 text-left text-[11px] font-mono text-neutral-200 hover:bg-neutral-700 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
    >
      <span className="shrink-0" style={{ color: accent }}>
        <KindIcon kind={kind} />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

KindButton.propTypes = {
  kind: PropTypes.string.isRequired,
  accent: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
};

/** A titled group of kinds in the left column. */
function KindGroup({ title, accent, kinds, labelOf, onPick }) {
  return (
    <div>
      <div
        className="mb-1.5 px-0.5 text-[10px] font-mono uppercase tracking-wider font-semibold"
        style={{ color: accent }}
      >
        <span>{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {kinds.map((kind) => (
          <KindButton
            key={kind}
            kind={kind}
            accent={accent}
            label={labelOf(kind)}
            onClick={() => onPick(kind)}
          />
        ))}
      </div>
    </div>
  );
}

KindGroup.propTypes = {
  title: PropTypes.string.isRequired,
  accent: PropTypes.string.isRequired,
  kinds: PropTypes.arrayOf(PropTypes.string).isRequired,
  labelOf: PropTypes.func.isRequired,
  onPick: PropTypes.func.isRequired,
};

/**
 * The "add" popover for a layer's effect stack.
 *
 * Left column: every kind that can be added, grouped as tone adjustments,
 * pixel filters, and layer-style effects — the dot colours match the rows they
 * become. Right column: one-click presets, each a bundle of adjustments
 * rendered on the layer's own bitmap, because a look is judged on the picture
 * rather than a stock tile. Everything either column adds lands in the same
 * stack, which is why they share one entry point.
 *
 * The preset column only appears for image layers; nothing else has a bitmap
 * to preview against.
 */
export default function AddKindPicker({
  isImage = true,
  bitmap = null,
  imageKey = null,
  adjustments = null,
  showEffects = true,
  onPick,
  onApplyPreset,
  onClose,
  side = "left",
}) {
  const { t } = useI18n();
  const showPresets = isImage && Boolean(onApplyPreset);
  const thumbs = usePresetThumbs(showPresets ? bitmap : null, imageKey);
  const activePresetKey = useActivePresetKey(adjustments ?? {});

  return (
    <AnchoredAdjustmentPicker
      side={side}
      onClose={onClose}
      showPresets={showPresets}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-[12px] font-medium font-mono text-neutral-100 uppercase tracking-wider">
          {t("editor.layers.addAdjustment")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white transition-colors text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          aria-label={t("editor.popover.close")}
        >
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: categories in scrollable body */}
        <div className="ui-scroll min-h-0 flex-1 min-w-0 overflow-y-auto overflow-x-hidden flex flex-col gap-3">
          <KindGroup
            title={t("editor.layers.adjustments")}
            accent={ACCENT.adjustment}
            kinds={TONE_ADJUSTMENT_KINDS}
            labelOf={(kind) => t(adjustmentLabelKey(kind))}
            onPick={(kind) => onPick(kind, false)}
          />
          <KindGroup
            title={t("editor.layers.filters")}
            accent={ACCENT.filter}
            kinds={FILTER_KINDS}
            labelOf={(kind) => t(adjustmentLabelKey(kind))}
            onPick={(kind) => onPick(kind, false)}
          />
          {showEffects ? (
            <KindGroup
              title={t("editor.layers.effects")}
              accent={ACCENT.effect}
              kinds={EFFECT_KINDS}
              labelOf={(kind) => t(effectLabelKey(kind))}
              onPick={(kind) => onPick(kind, true)}
            />
          ) : null}
        </div>

        {/* Right: presets column */}
        {showPresets ? (
          <div className="ui-scroll min-h-0 w-[8.25rem] shrink-0 overflow-y-auto overflow-x-hidden flex flex-col gap-3">
            {FILTER_CATEGORIES.map((category) => (
              <div key={category.key}>
                <div className="mb-1.5 px-0.5 text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
                  {t(category.labelKey)}
                </div>
                <div className="flex flex-col gap-2 p-0.5">
                  {category.presets.map((preset) => {
                    const thumb = thumbs[preset.key];
                    const active = preset.key === activePresetKey;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => onApplyPreset(preset)}
                        aria-pressed={active}
                        title={t(preset.labelKey)}
                        className={`group/preset flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                          active
                            ? "bg-neutral-800 ring-1 ring-[#a7ffd4]"
                            : "bg-neutral-900 hover:bg-neutral-800 hover:ring-1 hover:ring-white/20"
                        }`}
                      >
                        {thumb ? (
                          <img
                            src={thumb.url}
                            width={thumb.width}
                            height={thumb.height}
                            alt={t(preset.labelKey)}
                            className="h-12 w-full rounded-lg object-cover"
                          />
                        ) : (
                          <div className="h-12 w-full rounded-lg bg-neutral-800" />
                        )}
                        <span className="w-full truncate text-center text-[10px] font-mono text-neutral-400 group-hover/preset:text-neutral-200 transition-colors">
                          {t(preset.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </AnchoredAdjustmentPicker>
  );
}

AddKindPicker.propTypes = {
  /** Only image layers get the preset column; nothing else has a bitmap. */
  isImage: PropTypes.bool,
  /** The decoded layer image the swatches are rendered from. */
  bitmap: PropTypes.object,
  /** Stable identity of that image, used to cache swatches. */
  imageKey: PropTypes.string,
  /** The layer's current adjustments, for highlighting the matching preset. */
  adjustments: PropTypes.object,
  /** Whether the effects group is shown in the kinds column. */
  showEffects: PropTypes.bool,
  onPick: PropTypes.func.isRequired,
  /** Absent for layers that cannot take presets; hides the column. */
  onApplyPreset: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  side: PropTypes.oneOf(["left", "right", "top"]),
};
