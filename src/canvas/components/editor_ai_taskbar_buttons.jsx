import PropTypes from "prop-types";
import { useState } from "react";
import {
  IconExpand,
  IconHd,
  IconLayers,
  IconSticker,
  IconWand,
} from "../icons.jsx";
import InfoHint from "./info_hint.jsx";
import { useI18n } from "../use_i18n.js";
import { CAPABILITY, isCapabilitySupported } from "../platform_capabilities.js";
import {
  RETOUCH_SLIDERS,
  defaultRetouchStrengths,
  hasRetouchWork,
} from "../editor/portrait_retouch_plan.js";

/**
 * The single-image AI actions that live in the taskbar's More menu.
 *
 * The taskbar keeps only Remove BG, Generative Fill, Adjustments, More and the
 * Agent on its face; expand, upscale, auto enhance, portrait retouch and split
 * layers sit in an AI group inside More. That group carries its own slider
 * model (retouch), so it lives beside the taskbar rather than inside it.
 *
 * The icon-button classes are exported from here so the taskbar and these
 * actions cannot drift into two slightly different AI buttons.
 */

/** Compact icon-only button used throughout the taskbar. */
export const ICON_BTN =
  "flex h-6 w-6 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20";
export const ICON_BTN_DEFAULT = `${ICON_BTN} text-neutral-400 hover:bg-white/10 hover:text-neutral-200`;
export const ICON_BTN_AI = `${ICON_BTN} bg-white/10 text-neutral-300 hover:bg-white/20 hover:text-white`;

/** One retouch slider row: name, current percent, and the range input. */
function RetouchSlider({ slider, value, disabled, onChange, t }) {
  const label = t(slider.labelKey);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[10px] font-mono uppercase tracking-wide text-neutral-400">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-300">{value}%</span>
      </div>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="flat-range w-full cursor-pointer"
      />
    </div>
  );
}

RetouchSlider.propTypes = {
  slider: PropTypes.object.isRequired,
  value: PropTypes.number.isRequired,
  disabled: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};


/**
 * Portrait retouch's three strengths and one apply action, shown inline in the
 * More menu. The strengths start conservative and are not persisted, so a
 * second visit cannot silently re-apply a strength nobody chose.
 */
function PortraitRetouchPanel({ busy = false, onApply }) {
  const { t } = useI18n();
  const [strengths, setStrengths] = useState(defaultRetouchStrengths);
  // Every step at zero is a no-op; the engine would return a copy and the
  // click would look broken, so the action stays disabled instead.
  const ready = hasRetouchWork(strengths);

  return (
    <div className="flex flex-col gap-2 px-2.5 pb-2 pt-1">
      <InfoHint
        label={t("editor.taskbar.retouch")}
        text={t("editor.retouch.hint")}
        className="text-[10px] uppercase tracking-wide text-neutral-400"
      />
      {RETOUCH_SLIDERS.map((slider) => (
        <RetouchSlider
          key={slider.key}
          slider={slider}
          value={strengths[slider.key]}
          disabled={busy}
          onChange={(value) =>
            setStrengths((current) => ({ ...current, [slider.key]: value }))
          }
          t={t}
        />
      ))}
      <button
        type="button"
        data-testid="more-retouch-apply"
        disabled={busy || !ready}
        onClick={() => onApply(strengths)}
        className="rounded-lg bg-white py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-neutral-200 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
      >
        {busy ? t("editor.retouch.working") : t("editor.apply")}
      </button>
    </div>
  );
}

PortraitRetouchPanel.propTypes = {
  busy: PropTypes.bool,
  onApply: PropTypes.func.isRequired,
};

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent";

/** One AI row of the More menu: a monochrome icon and a label. */
function AiMenuItem({ icon: Icon, label, testId, disabled, onClick, title }) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={MENU_ITEM}
    >
      <Icon size={13} className="shrink-0 text-neutral-300" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

AiMenuItem.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  testId: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  title: PropTypes.string,
};

/**
 * The AI group of the More menu for a selected image layer. Every action
 * closes the menu through `onDone`, except Portrait Retouch, which first
 * unfolds its sliders in place.
 */
export function EditorAiMenuSection({
  onOutpaint = null,
  onUpscale = null,
  upscaleBusy = false,
  onAutoEnhance = null,
  onPortraitRetouch = null,
  portraitRetouchBusy = false,
  onSplitLayers = null,
  splitLayersBusy = false,
  repaintBusy = false,
  onDone,
}) {
  const { t } = useI18n();
  const [retouchOpen, setRetouchOpen] = useState(false);
  const canSplitLayers = isCapabilitySupported(CAPABILITY.AI_LAYER_SPLIT);
  const run = (action) => () => {
    onDone();
    void action?.();
  };

  return (
    <div data-testid="more-ai-section" className="flex flex-col gap-0.5">
      <div className="px-2.5 pb-0.5 pt-1 text-[9px] uppercase tracking-wide text-neutral-500">
        {t("editor.taskbar.aiSection")}
      </div>
      {onOutpaint ? (
        <AiMenuItem
          icon={IconExpand}
          label={t("editor.taskbar.outpaint")}
          testId="more-outpaint"
          // Expand shares Repaint's busy flag: the two never run at once.
          disabled={repaintBusy}
          onClick={run(onOutpaint)}
        />
      ) : null}
      {onUpscale ? (
        <>
          <AiMenuItem
            icon={IconHd}
            label={t("editor.upscale.2x")}
            title={t("editor.upscale.2xHint")}
            testId="more-upscale-2x"
            disabled={upscaleBusy}
            onClick={run(() => onUpscale(2))}
          />
          <AiMenuItem
            icon={IconHd}
            label={t("editor.upscale.4x")}
            title={t("editor.upscale.4xHint")}
            testId="more-upscale-4x"
            disabled={upscaleBusy}
            onClick={run(() => onUpscale(4))}
          />
          <AiMenuItem
            icon={IconHd}
            label={t("editor.upscale.anime")}
            title={t("editor.upscale.animeHint")}
            testId="more-upscale-anime"
            disabled={upscaleBusy}
            onClick={run(() => onUpscale({ scale: 4, modelId: "realesrgan-anime-4x" }))}
          />
        </>
      ) : null}
      {onAutoEnhance ? (
        <AiMenuItem
          icon={IconWand}
          label={t("editor.taskbar.autoEnhance")}
          testId="more-auto-enhance"
          onClick={run(onAutoEnhance)}
        />
      ) : null}
      {onPortraitRetouch ? (
        <>
          <AiMenuItem
            icon={IconSticker}
            label={t("editor.taskbar.retouch")}
            testId="more-retouch"
            disabled={portraitRetouchBusy}
            onClick={() => setRetouchOpen((open) => !open)}
          />
          {retouchOpen ? (
            <PortraitRetouchPanel
              busy={portraitRetouchBusy}
              onApply={(strengths) => {
                onDone();
                onPortraitRetouch(strengths);
              }}
            />
          ) : null}
        </>
      ) : null}
      {onSplitLayers ? (
        <AiMenuItem
          icon={IconLayers}
          label={t("editor.taskbar.splitLayers")}
          title={
            canSplitLayers
              ? undefined
              : t("editor.taskbar.splitLayersUnavailableWeb")
          }
          testId="more-split-layers"
          disabled={!canSplitLayers || splitLayersBusy}
          onClick={run(onSplitLayers)}
        />
      ) : null}
    </div>
  );
}

EditorAiMenuSection.propTypes = {
  onOutpaint: PropTypes.func,
  onUpscale: PropTypes.func,
  upscaleBusy: PropTypes.bool,
  onAutoEnhance: PropTypes.func,
  onPortraitRetouch: PropTypes.func,
  portraitRetouchBusy: PropTypes.bool,
  onSplitLayers: PropTypes.func,
  splitLayersBusy: PropTypes.bool,
  repaintBusy: PropTypes.bool,
  onDone: PropTypes.func.isRequired,
};
