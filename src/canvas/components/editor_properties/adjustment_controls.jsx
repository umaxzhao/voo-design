/**
 * Adjustment controls entry point: renders property controls for the active
 * adjustment layer or filter kind.
 */

import PropTypes from "prop-types";
import { useMemo } from "react";
import AdjustmentSlider from "./adjustment_slider.jsx";
import { createDefaultAdjustments } from "../../editor/scene_model.js";
import AdjustmentColorControls from "./adjustment_color_controls.jsx";
import AdjustmentChannelMixerControls from "./adjustment_channel_mixer_controls.jsx";
import AdjustmentGradientMapControls from "./adjustment_gradient_map_controls.jsx";
import AdjustmentSimpleControls from "./adjustment_simple_controls.jsx";

export {
  AdjustmentColorControls,
  AdjustmentChannelMixerControls,
  AdjustmentGradientMapControls,
  AdjustmentSimpleControls,
};

/**
 * The controls of a single adjustment kind, shared by the popover editor and
 * (historically) the properties panel. `adjustments` must already be
 * normalized; edits go through the panel's `edit`/`editAndCommit` write path
 * so dragging a slider still costs one undo step.
 */
export default function AdjustmentControls({
  kind,
  adjustments,
  edit,
  editAndCommit,
  commitNow = null,
  bitmap = null,
  t,
}) {
  /**
   * Every adjustment slider shares one commit boundary: the interaction end
   * (thumb released / value committed) lands the history snapshot. Wired here
   * once instead of on each slider call site. Memoised so the component
   * identity survives re-renders — a fresh type per render would remount every
   * slider mid-drag.
   */
  const Slider = useMemo(
    () =>
      function CommitSlider(props) {
        return (
          <AdjustmentSlider {...props} onCommit={commitNow ?? undefined} />
        );
      },
    [commitNow],
  );

  const updateCategory = (category, patch) => {
    edit({
      adjustments: {
        ...adjustments,
        [category]: { ...(adjustments[category] ?? {}), ...patch },
      },
    });
  };

  const resetCategory = (category) => {
    const defaults = createDefaultAdjustments();
    editAndCommit({
      adjustments: { ...adjustments, [category]: defaults[category] },
    });
  };

  switch (kind) {
    case "colorBalance":
    case "blackAndWhite":
    case "photoFilter":
      return (
        <AdjustmentColorControls
          kind={kind}
          adjustments={adjustments}
          updateCategory={updateCategory}
          resetCategory={resetCategory}
          Slider={Slider}
          t={t}
        />
      );

    case "channelMixer":
    case "selectiveColor":
      return (
        <AdjustmentChannelMixerControls
          kind={kind}
          adjustments={adjustments}
          updateCategory={updateCategory}
          resetCategory={resetCategory}
          Slider={Slider}
          t={t}
        />
      );

    case "gradientMap":
      return (
        <AdjustmentGradientMapControls
          adjustments={adjustments}
          updateCategory={updateCategory}
          resetCategory={resetCategory}
          t={t}
        />
      );

    default:
      return (
        <AdjustmentSimpleControls
          kind={kind}
          adjustments={adjustments}
          updateCategory={updateCategory}
          resetCategory={resetCategory}
          Slider={Slider}
          commitNow={commitNow}
          bitmap={bitmap}
          t={t}
        />
      );
  }
}

AdjustmentControls.propTypes = {
  kind: PropTypes.string.isRequired,
  adjustments: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  /** The adjusted layer's bitmap, when the caller has one: the histogram source. */
  bitmap: PropTypes.object,
  t: PropTypes.func.isRequired,
};
