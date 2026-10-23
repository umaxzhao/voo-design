/** Unified full-width dimension bar: W | [Link/Unlink] | H. */

import PropTypes from "prop-types";
import ScrubField from "../scrub_field.jsx";
import MixedField from "./mixed_field.jsx";
import { IconLink, IconUnlink } from "../../icons.jsx";
import EditorTooltip from "../editor_tooltip.jsx";

const COORD_LIMIT = 99999;

export default function TransformDimensionBar({
  commonW,
  commonH,
  lockRatio,
  setLockRatio,
  resizeTo,
  edit,
  commitNow,
  t,
}) {
  return (
    <div className="flex h-7 min-w-0 items-center rounded-xl bg-neutral-800 transition-colors hover:bg-neutral-800/80 focus-within:bg-neutral-800 focus-within:ring-1 focus-within:ring-[#a7ffd4]/40">
      {commonW.mixed ? (
        <MixedField label="W" bare />
      ) : (
        <ScrubField
          prefix="W"
          min={1}
          max={COORD_LIMIT}
          value={commonW.value}
          onValueChange={(value) => resizeTo("width", value)}
          onCommit={commitNow}
          ariaLabel="W"
          scrubHint={t("editor.props.dragToAdjust")}
          bare
        />
      )}
      <EditorTooltip
        title={
          lockRatio
            ? t("editor.props.unlockRatio")
            : t("editor.props.lockRatio")
        }
        side="top"
      >
        <button
          type="button"
          onClick={() => {
            const nextLock = !lockRatio;
            setLockRatio(nextLock);
            edit({ lockRatio: nextLock });
            commitNow?.();
          }}
          aria-pressed={lockRatio}
          aria-label={t("editor.props.lockRatio")}
          className={`flex h-7 w-6 shrink-0 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 rounded-md ${
            lockRatio
              ? "text-neutral-200 hover:text-white"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {lockRatio ? <IconLink size={12} /> : <IconUnlink size={12} />}
        </button>
      </EditorTooltip>
      {commonH.mixed ? (
        <MixedField label="H" bare />
      ) : (
        <ScrubField
          prefix="H"
          min={1}
          max={COORD_LIMIT}
          value={commonH.value}
          onValueChange={(value) => resizeTo("height", value)}
          onCommit={commitNow}
          ariaLabel="H"
          scrubHint={t("editor.props.dragToAdjust")}
          bare
        />
      )}
    </div>
  );
}

TransformDimensionBar.propTypes = {
  commonW: PropTypes.shape({
    value: PropTypes.number,
    mixed: PropTypes.bool,
  }).isRequired,
  commonH: PropTypes.shape({
    value: PropTypes.number,
    mixed: PropTypes.bool,
  }).isRequired,
  lockRatio: PropTypes.bool.isRequired,
  setLockRatio: PropTypes.func.isRequired,
  resizeTo: PropTypes.func.isRequired,
  edit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  t: PropTypes.func.isRequired,
};
