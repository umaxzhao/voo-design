/**
 * Corner radius controls for rect and image layers: uniform slider and
 * per-corner (TL, TR, BR, BL) unlinked scrub fields.
 */

import PropTypes from "prop-types";
import { useState } from "react";
import ScrubField from "../scrub_field.jsx";
import MixedField from "./mixed_field.jsx";
import EditorTooltip from "../editor_tooltip.jsx";
import { resolveCornerRadii } from "../../editor/scene_model_core.js";
import {
  IconCornerRadius,
  IconLink,
  IconUnlink,
} from "../../icons.jsx";

export default function TransformRadiusControls({
  object,
  commonCornerRadius,
  edit,
  editAndCommit,
  commitNow,
  t,
}) {
  const radii = resolveCornerRadii(
    object.cornerRadius,
    object.width,
    object.height,
  );
  const [radiusLinkState, setRadiusLinkState] = useState({
    objectId: object.id,
    unlinked: !radii.isUniform,
  });
  const unlinkedRadii =
    !radii.isUniform ||
    (radiusLinkState.objectId === object.id && radiusLinkState.unlinked);
  const setUnlinkedRadii = (unlinked) =>
    setRadiusLinkState({ objectId: object.id, unlinked });

  const cornerRadiusMax = Math.max(
    0,
    Math.floor(Math.min(object.width ?? 0, object.height ?? 0) / 2),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {commonCornerRadius.mixed ? (
          <div className="min-w-0 flex-1">
            <MixedField label={t("editor.props.cornerRadius")} suffix="px" />
          </div>
        ) : !unlinkedRadii ? (
          <div className="min-w-0 flex-1">
            <ScrubField
              prefix={<IconCornerRadius size={12} />}
              suffix="px"
              min={0}
              max={cornerRadiusMax}
              value={Math.round(radii.uniformRadius)}
              onValueChange={(val) => edit({ cornerRadius: val })}
              onCommit={commitNow}
              ariaLabel={t("editor.props.cornerRadius")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          </div>
        ) : null}
        {commonCornerRadius.mixed ? null : (
          <EditorTooltip
            title={
              unlinkedRadii
                ? t("editor.props.linkCorners")
                : t("editor.props.unlinkCorners")
            }
            side="top"
          >
            <button
              type="button"
              onClick={() => {
                if (unlinkedRadii) {
                  setUnlinkedRadii(false);
                  editAndCommit({ cornerRadius: Math.round(radii.tl) });
                } else {
                  setUnlinkedRadii(true);
                  const r = Math.round(radii.uniformRadius);
                  editAndCommit({
                    cornerRadius: { tl: r, tr: r, br: r, bl: r },
                  });
                }
              }}
              aria-label={
                unlinkedRadii
                  ? t("editor.props.linkCorners")
                  : t("editor.props.unlinkCorners")
              }
              aria-pressed={unlinkedRadii}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                unlinkedRadii
                  ? "bg-white/10 text-white"
                  : "text-neutral-400 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {unlinkedRadii ? (
                <IconUnlink size={13} />
              ) : (
                <IconLink size={13} />
              )}
            </button>
          </EditorTooltip>
        )}
      </div>
      {!commonCornerRadius.mixed && unlinkedRadii ? (
        <div className="grid grid-cols-2 gap-1">
          {[
            {
              key: "tl",
              label: t("editor.props.cornerTopLeft"),
              abbrev: "TL",
            },
            {
              key: "tr",
              label: t("editor.props.cornerTopRight"),
              abbrev: "TR",
            },
            {
              key: "br",
              label: t("editor.props.cornerBottomRight"),
              abbrev: "BR",
            },
            {
              key: "bl",
              label: t("editor.props.cornerBottomLeft"),
              abbrev: "BL",
            },
          ].map(({ key, label, abbrev }) => (
            <ScrubField
              key={key}
              prefix={
                <span className="text-[9px] font-mono text-neutral-400">
                  {abbrev}
                </span>
              }
              min={0}
              max={cornerRadiusMax}
              value={Math.round(radii[key] ?? 0)}
              onValueChange={(val) =>
                edit({ cornerRadius: { ...radii, [key]: val } })
              }
              onCommit={commitNow}
              ariaLabel={label}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

TransformRadiusControls.propTypes = {
  object: PropTypes.object.isRequired,
  commonCornerRadius: PropTypes.shape({
    value: PropTypes.any,
    mixed: PropTypes.bool,
  }).isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  t: PropTypes.func.isRequired,
};
