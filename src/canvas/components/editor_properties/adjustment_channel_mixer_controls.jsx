/** Channel mixer and selective color adjustment controls. */

import PropTypes from "prop-types";
import { useState } from "react";
import {
  MIXER_CHANNELS,
  MIXER_WEIGHTS,
  SC_TARGETS,
  SC_INKS,
} from "./adjustment_controls_constants.js";

export default function AdjustmentChannelMixerControls({
  kind,
  adjustments,
  updateCategory,
  resetCategory,
  Slider,
  t,
}) {
  const [mixerChannel, setMixerChannel] = useState("red");
  const activeMixerChannel = adjustments.channelMixer?.monochrome
    ? "gray"
    : mixerChannel;
  const [scTarget, setScTarget] = useState("reds");

  switch (kind) {
    case "channelMixer":
      return (
        <div className="rounded-xl bg-[#1a1a1a] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={adjustments.channelMixer.enabled}
                aria-label={t("editor.props.channelMixer")}
                onChange={(event) =>
                  updateCategory("channelMixer", {
                    enabled: event.target.checked,
                  })
                }
                className="flat-check"
              />
              <span className="text-[10px] font-mono text-neutral-300">
                {t("editor.props.channelMixer")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={adjustments.channelMixer.monochrome}
                aria-label={t("editor.props.cmMonochrome")}
                onChange={(event) =>
                  updateCategory("channelMixer", {
                    monochrome: event.target.checked,
                  })
                }
                className="flat-check"
              />
              <span className="text-[10px] text-neutral-400">
                {t("editor.props.cmMonochrome")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => resetCategory("channelMixer")}
              className="text-[9px] font-mono text-neutral-500 hover:text-neutral-300"
            >
              {t("editor.props.reset")}
            </button>
          </div>
          {!adjustments.channelMixer.monochrome ? (
            <div className="mt-1.5 flex items-center gap-1">
              {MIXER_CHANNELS.map((channel) => (
                <button
                  key={channel.key}
                  type="button"
                  onClick={() => setMixerChannel(channel.key)}
                  className={`rounded-lg px-1.5 py-0.5 font-mono text-[9px] ${
                    activeMixerChannel === channel.key
                      ? "bg-neutral-700 text-neutral-100"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {t(channel.labelKey)}
                </button>
              ))}
            </div>
          ) : null}
          {MIXER_WEIGHTS.map((weight) => (
            <Slider
              key={weight.key}
              label={t(weight.labelKey)}
              min={-200}
              max={200}
              step={1}
              value={adjustments.channelMixer[activeMixerChannel][weight.key]}
              enabled={adjustments.channelMixer.enabled}
              onToggle={(enabled) =>
                updateCategory("channelMixer", { enabled })
              }
              onChange={(value) =>
                updateCategory("channelMixer", {
                  [activeMixerChannel]: {
                    ...adjustments.channelMixer[activeMixerChannel],
                    [weight.key]: value,
                  },
                })
              }
              onReset={() => resetCategory("channelMixer")}
            />
          ))}
        </div>
      );

    case "selectiveColor":
      return (
        <div className="rounded-xl bg-[#1a1a1a] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={adjustments.selectiveColor.enabled}
                aria-label={t("editor.props.selectiveColor")}
                onChange={(event) =>
                  updateCategory("selectiveColor", {
                    enabled: event.target.checked,
                  })
                }
                className="flat-check"
              />
              <span className="text-[10px] font-mono text-neutral-300">
                {t("editor.props.selectiveColor")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {["relative", "absolute"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateCategory("selectiveColor", { mode })}
                  className={`rounded-lg px-1.5 py-0.5 font-mono text-[9px] ${
                    adjustments.selectiveColor.mode === mode
                      ? "bg-neutral-700 text-neutral-100"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {t(
                    mode === "relative"
                      ? "editor.props.scRelative"
                      : "editor.props.scAbsolute",
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => resetCategory("selectiveColor")}
              className="text-[9px] font-mono text-neutral-500 hover:text-neutral-300"
            >
              {t("editor.props.reset")}
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {SC_TARGETS.map((target) => (
              <button
                key={target.key}
                type="button"
                onClick={() => setScTarget(target.key)}
                className={`rounded-lg px-1.5 py-0.5 font-mono text-[9px] ${
                  scTarget === target.key
                    ? "bg-neutral-700 text-neutral-100"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {t(target.labelKey)}
              </button>
            ))}
          </div>
          {SC_INKS.map((ink) => (
            <Slider
              key={ink.key}
              label={t(ink.labelKey)}
              min={-100}
              max={100}
              step={1}
              value={adjustments.selectiveColor[scTarget][ink.key]}
              enabled={adjustments.selectiveColor.enabled}
              onToggle={(enabled) =>
                updateCategory("selectiveColor", { enabled })
              }
              onChange={(value) =>
                updateCategory("selectiveColor", {
                  [scTarget]: {
                    ...adjustments.selectiveColor[scTarget],
                    [ink.key]: value,
                  },
                })
              }
              onReset={() => resetCategory("selectiveColor")}
            />
          ))}
        </div>
      );

    default:
      return null;
  }
}

AdjustmentChannelMixerControls.propTypes = {
  kind: PropTypes.string.isRequired,
  adjustments: PropTypes.object.isRequired,
  updateCategory: PropTypes.func.isRequired,
  resetCategory: PropTypes.func.isRequired,
  Slider: PropTypes.elementType.isRequired,
  t: PropTypes.func.isRequired,
};
