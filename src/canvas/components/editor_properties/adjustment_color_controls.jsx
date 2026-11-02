/** Color balance, black & white, and photo filter adjustment controls. */

import PropTypes from "prop-types";
import {
  COLOR_BALANCE_ZONES,
  COLOR_BALANCE_CHANNELS,
  BW_CHANNELS,
} from "./adjustment_controls_constants.js";

export default function AdjustmentColorControls({
  kind,
  adjustments,
  updateCategory,
  resetCategory,
  Slider,
  t,
}) {
  switch (kind) {
    case "colorBalance":
      return (
        <div className="rounded-xl bg-[#1a1a1a] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={adjustments.colorBalance.enabled}
                aria-label={t("editor.props.colorBalance")}
                onChange={(event) =>
                  updateCategory("colorBalance", {
                    enabled: event.target.checked,
                  })
                }
                className="flat-check"
              />
              <span className="text-[10px] font-mono text-neutral-300">
                {t("editor.props.colorBalance")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={adjustments.colorBalance.preserveLuminosity}
                aria-label={t("editor.props.cbPreserve")}
                onChange={(event) =>
                  updateCategory("colorBalance", {
                    preserveLuminosity: event.target.checked,
                  })
                }
                className="flat-check"
              />
              <span className="text-[10px] text-neutral-400">
                {t("editor.props.cbPreserve")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => resetCategory("colorBalance")}
              className="text-[9px] font-mono text-neutral-500 hover:text-neutral-300"
            >
              {t("editor.props.reset")}
            </button>
          </div>
          {COLOR_BALANCE_ZONES.map((zone) => (
            <div key={zone.key} className="mt-1.5">
              <div className="text-[9px] font-mono uppercase tracking-wide text-neutral-500">
                {t(zone.labelKey)}
              </div>
              {COLOR_BALANCE_CHANNELS.map((channel) => (
                <Slider
                  key={channel.key}
                  label={t(channel.labelKey)}
                  min={-100}
                  max={100}
                  step={1}
                  value={adjustments.colorBalance[zone.key][channel.key]}
                  enabled={adjustments.colorBalance.enabled}
                  onToggle={(enabled) =>
                    updateCategory("colorBalance", { enabled })
                  }
                  onChange={(value) =>
                    updateCategory("colorBalance", {
                      [zone.key]: {
                        ...adjustments.colorBalance[zone.key],
                        [channel.key]: value,
                      },
                    })
                  }
                  onReset={() => resetCategory("colorBalance")}
                />
              ))}
            </div>
          ))}
        </div>
      );

    case "blackAndWhite":
      return (
        <div className="rounded-xl bg-[#1a1a1a] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={adjustments.blackAndWhite.enabled}
                aria-label={t("editor.props.blackAndWhite")}
                onChange={(event) =>
                  updateCategory("blackAndWhite", {
                    enabled: event.target.checked,
                  })
                }
                className="flat-check"
              />
              <span className="text-[10px] font-mono text-neutral-300">
                {t("editor.props.blackAndWhite")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={adjustments.blackAndWhite.useTint}
                aria-label={t("editor.props.bwTint")}
                onChange={(event) =>
                  updateCategory("blackAndWhite", {
                    useTint: event.target.checked,
                  })
                }
                className="flat-check"
              />
              <span className="text-[10px] text-neutral-400">
                {t("editor.props.bwTint")}
              </span>
              <input
                type="color"
                value={adjustments.blackAndWhite.tintColor}
                onChange={(event) =>
                  updateCategory("blackAndWhite", {
                    tintColor: event.target.value,
                  })
                }
                aria-label={t("editor.props.bwTintColor")}
                className="h-5 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => resetCategory("blackAndWhite")}
              className="text-[9px] font-mono text-neutral-500 hover:text-neutral-300"
            >
              {t("editor.props.reset")}
            </button>
          </div>
          {BW_CHANNELS.map((channel) => (
            <Slider
              key={channel.key}
              label={t(channel.labelKey)}
              min={-200}
              max={300}
              step={1}
              value={adjustments.blackAndWhite[channel.key]}
              enabled={adjustments.blackAndWhite.enabled}
              onToggle={(enabled) =>
                updateCategory("blackAndWhite", { enabled })
              }
              onChange={(value) =>
                updateCategory("blackAndWhite", { [channel.key]: value })
              }
              onReset={() => resetCategory("blackAndWhite")}
            />
          ))}
        </div>
      );

    case "photoFilter":
      return (
        <div className="rounded-xl bg-[#1a1a1a] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={adjustments.photoFilter.enabled}
                aria-label={t("editor.props.photoFilter")}
                onChange={(event) =>
                  updateCategory("photoFilter", {
                    enabled: event.target.checked,
                  })
                }
                className="flat-check"
              />
              <span className="text-[10px] font-mono text-neutral-300">
                {t("editor.props.photoFilter")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={adjustments.photoFilter.color}
                onChange={(event) =>
                  updateCategory("photoFilter", { color: event.target.value })
                }
                aria-label={t("editor.props.pfColor")}
                className="h-5 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0 outline-none"
              />
              <input
                type="checkbox"
                checked={adjustments.photoFilter.preserveLuminosity}
                aria-label={t("editor.props.pfPreserve")}
                onChange={(event) =>
                  updateCategory("photoFilter", {
                    preserveLuminosity: event.target.checked,
                  })
                }
                className="flat-check"
              />
              <span className="text-[10px] text-neutral-400">
                {t("editor.props.pfPreserve")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => resetCategory("photoFilter")}
              className="text-[9px] font-mono text-neutral-500 hover:text-neutral-300"
            >
              {t("editor.props.reset")}
            </button>
          </div>
          <Slider
            label={t("editor.props.pfDensity")}
            min={0}
            max={100}
            step={1}
            value={adjustments.photoFilter.density}
            enabled={adjustments.photoFilter.enabled}
            onToggle={(enabled) => updateCategory("photoFilter", { enabled })}
            onChange={(value) =>
              updateCategory("photoFilter", { density: value })
            }
            onReset={() => resetCategory("photoFilter")}
          />
        </div>
      );

    default:
      return null;
  }
}

AdjustmentColorControls.propTypes = {
  kind: PropTypes.string.isRequired,
  adjustments: PropTypes.object.isRequired,
  updateCategory: PropTypes.func.isRequired,
  resetCategory: PropTypes.func.isRequired,
  Slider: PropTypes.elementType.isRequired,
  t: PropTypes.func.isRequired,
};
