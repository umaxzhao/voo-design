/**
 * Effect controls entry point: renders property controls for the active
 * layer effect kind.
 */

import PropTypes from "prop-types";
import { useMemo } from "react";
import ScrubField from "../scrub_field.jsx";
import { starterEffect } from "../../editor/adjustment_catalog.js";
import { ColourRow, TITLE_KEYS } from "./effect_controls_helpers.jsx";
import EffectShadowGlowControls from "./effect_shadow_glow_controls.jsx";
import EffectBevelSatinControls from "./effect_bevel_satin_controls.jsx";
import EffectGradientOverlayControls from "./effect_gradient_overlay_controls.jsx";

export {
  ColourRow,
  TITLE_KEYS,
  EffectShadowGlowControls,
  EffectBevelSatinControls,
  EffectGradientOverlayControls,
};

/**
 * The controls of a single effect kind, shared by the popover editor. Reads
 * the normalized effect via `effects[kind]`; writes merge into the node's raw
 * effects field (`rawEffects`) so the serialised shape stays compact.
 */
export default function EffectControls({
  kind,
  effects = {},
  rawEffects = null,
  edit,
  editAndCommit,
  commitNow = undefined,
  t,
}) {
  // Falls back to the starter the way the writers below already do. A freshly
  // picked effect renders one frame before its write lands, and every case
  // below reads `current` directly -- without this the popover throws on the
  // first render after "add", which looks like the add button doing nothing.
  const current = effects[kind] ?? starterEffect(kind);
  const title = t(TITLE_KEYS[kind] ?? "editor.props.effects");

  const setEffect = (patch) =>
    edit({
      effects: {
        ...(rawEffects ?? {}),
        [kind]: { ...(current ?? starterEffect(kind)), ...patch },
      },
    });

  const setAndCommit = (patch) =>
    editAndCommit({
      effects: {
        ...(rawEffects ?? {}),
        [kind]: { ...(current ?? starterEffect(kind)), ...patch },
      },
    });

  // Continuous effect fields (scrub/typed numbers) share one commit boundary:
  // the interaction end lands the history snapshot. Wired here once instead of
  // on every ScrubField call site. Memoised so the component identity survives
  // re-renders — a fresh type per render would remount every field.
  const Field = useMemo(
    () =>
      function CommitField(props) {
        return <ScrubField {...props} onCommit={commitNow ?? undefined} />;
      },
    [commitNow],
  );

  // starterEffect returns null for a kind it does not know.
  if (!current) return null;

  switch (kind) {
    case "shadow":
    case "innerShadow":
    case "glow":
    case "innerGlow":
    case "fill":
    case "stroke":
      return (
        <EffectShadowGlowControls
          kind={kind}
          current={current}
          title={title}
          setEffect={setEffect}
          setAndCommit={setAndCommit}
          Field={Field}
          t={t}
        />
      );

    case "satin":
    case "bevel":
      return (
        <EffectBevelSatinControls
          kind={kind}
          current={current}
          title={title}
          setEffect={setEffect}
          setAndCommit={setAndCommit}
          Field={Field}
          t={t}
        />
      );

    case "gradientOverlay":
      return (
        <EffectGradientOverlayControls
          current={current}
          title={title}
          setEffect={setEffect}
          Field={Field}
          t={t}
        />
      );

    default:
      return null;
  }
}

EffectControls.propTypes = {
  kind: PropTypes.string.isRequired,
  effects: PropTypes.object,
  rawEffects: PropTypes.object,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  /** Interaction-end commit for the continuous (debounced) fields. */
  commitNow: PropTypes.func,
  t: PropTypes.func.isRequired,
};
