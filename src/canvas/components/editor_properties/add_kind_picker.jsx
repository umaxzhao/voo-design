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
import { useMemo, useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { usePresetThumbs, useActivePresetKey } from "./use_preset_thumbs.js";
import KindIcon from "./kind_icons.jsx";

/**
 * A small reference image for template swatches when the layer has no bitmap
 * (frames, groups, shapes). Bands of sky, skin, foliage and neutral greys make
 * a preset's tint/contrast readable without pretending to be the layer itself.
 */
function createPresetSample() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const bands = [
    ["#27364a", 0, 0.28],
    ["#7fb4d8", 0.22, 0.34],
    ["#d9a07c", 0.55, 0.32],
    ["#7d8a5a", 0.84, 0.3],
  ];
  ctx.fillStyle = "#dadada";
  ctx.fillRect(0, 0, 96, 64);
  for (const [colour, start, width] of bands) {
    ctx.fillStyle = colour;
    ctx.fillRect(start * 96, 0, width * 96, 64);
  }
  // White and black patches keep exposure/contrast presets legible.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 14, 12);
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 52, 14, 12);
  return canvas;
}

const PRESET_SAMPLE = createPresetSample();

/** Group accents, kept in sync with the dots on the effects list. */
const ACCENT = {
  adjustment: "#7fd4a8",
  filter: "#38bdf8",
  effect: "#b3a0ff",
};

/** Layer-level controls that are node fields rather than adjustment kinds. */
export const LAYER_EFFECT_KINDS = ["layerBlur", "backgroundBlur", "noise"];

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
  if (kinds.length === 0) return null;
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
 * Left column: every kind that can be added, grouped as tone adjustments
 * (green), pixel filters (blue), and layer-style effects (purple) — the same
 * accent colours the stack rows use. Right column: one-click templates
 * (presets). An image layer previews them on its own bitmap; frames, groups and
 * shapes use a small reference swatch so the column never collapses into empty
 * placeholders. Everything either column adds lands in the same stack, which is
 * why they share one entry point.
 */
export default function AddKindPicker({
  isImage = true,
  bitmap = null,
  imageKey = null,
  adjustments = null,
  showEffects = true,
  onPick,
  onPickLayerEffect = null,
  onApplyPreset,
  onClose,
  side = "left",
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const match = (label) => !needle || label.toLowerCase().includes(needle);
  const visibleAdjustments = TONE_ADJUSTMENT_KINDS.filter((kind) =>
    match(t(adjustmentLabelKey(kind))),
  );
  const visibleFilters = FILTER_KINDS.filter((kind) =>
    match(t(adjustmentLabelKey(kind))),
  );
  const visibleEffects = EFFECT_KINDS.filter((kind) =>
    match(t(effectLabelKey(kind))),
  );
  const visibleLayerEffects = LAYER_EFFECT_KINDS.filter((kind) =>
    match(t(`editor.props.${kind}`)),
  );
  const hasMatches =
    visibleAdjustments.length +
      visibleFilters.length +
      visibleEffects.length +
      visibleLayerEffects.length >
    0;
  // Templates are useful for frames/groups too (adjustments apply to the whole
  // layer), so the column follows the handler rather than the image kind.
  const showPresets = Boolean(onApplyPreset);
  const sample = useMemo(
    () => bitmap ?? PRESET_SAMPLE,
    [bitmap],
  );
  const thumbs = usePresetThumbs(
    showPresets ? sample : null,
    showPresets ? (bitmap ? imageKey ?? "bitmap" : "preset-sample") : null,
  );
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

      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-neutral-950/60 px-2.5">
        <span aria-hidden="true" className="text-[11px] text-neutral-500">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("editor.layers.searchPlaceholder")}
          aria-label={t("editor.layers.searchPlaceholder")}
          data-testid="adjustment-picker-search"
          className="h-8 min-w-0 flex-1 bg-transparent text-[11px] font-mono text-neutral-200 placeholder:text-neutral-400 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        />
      </div>
      {!hasMatches ? (
        <div className="rounded-xl bg-neutral-950/40 px-3 py-4 text-center text-[11px] font-mono text-neutral-500">
          {t("editor.layers.searchEmpty")}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: categories in scrollable body */}
        <div className="ui-scroll min-h-0 flex-1 min-w-0 overflow-y-auto overflow-x-hidden flex flex-col gap-3">
          <KindGroup
            title={t("editor.layers.adjustments")}
            accent={ACCENT.adjustment}
            kinds={visibleAdjustments}
            labelOf={(kind) => t(adjustmentLabelKey(kind))}
            onPick={(kind) => onPick(kind, false)}
          />
          <KindGroup
            title={t("editor.layers.filters")}
            accent={ACCENT.filter}
            kinds={visibleFilters}
            labelOf={(kind) => t(adjustmentLabelKey(kind))}
            onPick={(kind) => onPick(kind, false)}
          />
          {showEffects ? (
            <KindGroup
              title={t("editor.layers.effects")}
              accent={ACCENT.effect}
              kinds={visibleEffects}
              labelOf={(kind) => t(effectLabelKey(kind))}
              onPick={(kind) => onPick(kind, true)}
            />
          ) : null}
          {onPickLayerEffect ? (
            <KindGroup
              title={t("editor.props.blurNoise")}
              accent={ACCENT.effect}
              kinds={visibleLayerEffects}
              labelOf={(kind) => t(`editor.props.${kind}`)}
              onPick={onPickLayerEffect}
            />
          ) : null}
        </div>

        {/* Right: presets column */}
        {showPresets && !needle ? (
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
                          <div className="flex h-12 w-full items-center justify-center rounded-lg bg-neutral-900 text-neutral-500 ring-1 ring-white/10">
                            <KindIcon kind="brightness" />
                          </div>
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
  /** Kept for callers that distinguish image layers; templates now always show. */
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
  /** Adds node-level blur/noise entries from the picker. */
  onPickLayerEffect: PropTypes.func,
  /** Absent for layers that cannot take presets; hides the column. */
  onApplyPreset: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  side: PropTypes.oneOf(["left", "right", "top"]),
};
