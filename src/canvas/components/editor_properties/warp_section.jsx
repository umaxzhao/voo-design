import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { TOOL } from "../../editor/editor_constants.js";
import ScrubField from "../scrub_field.jsx";
import WarpStyleIcon from "./warp_style_icon.jsx";
import {
  PHOTOSHOP_WARP_PRESETS,
  generatePhotoshopWarpPreset,
  resampleMeshGrid,
} from "../../editor/mesh_transform.js";
import {
  perspectiveParamsToCorners,
  cornersToPerspectiveParams,
} from "../../editor/perspective_geometry.js";

const WARP_DETAILS = {
  [TOOL.PERSPECTIVE]: {
    hintKey: "editor.warp.perspectiveHint",
  },
  [TOOL.DISTORT]: {
    hintKey: "editor.warp.distortHint",
  },
  [TOOL.PUPPET_WARP]: {
    hintKey: "editor.warp.puppetHint",
  },
};

/** Picker order: manual mesh first, then the canonical Photoshop styles. */
const WARP_STYLE_OPTIONS = ["custom", ...PHOTOSHOP_WARP_PRESETS];

/** The active warp mode owns the panel; object transform fields stay hidden. */
export default function WarpSection({
  tool,
  object = null,
  edit = null,
  editAndCommit = null,
  commitNow = null,
  onReset,
}) {
  const { t } = useI18n();
  const detail = WARP_DETAILS[tool];
  if (!detail) return null;

  const isPerspective = tool === TOOL.PERSPECTIVE;
  const isDistort = tool === TOOL.DISTORT;

  // Perspective state
  const corners = object?.perspectiveCorners ?? null;
  const { horizontal, vertical, skewX, skewY } =
    cornersToPerspectiveParams(corners);

  // Distort / Warp Style state
  const preset = object?.warpMesh?.preset || "custom";
  const bend = object?.warpMesh?.bend !== undefined ? object.warpMesh.bend : 0;
  const hDistort =
    object?.warpMesh?.hDistort !== undefined ? object.warpMesh.hDistort : 0;
  const vDistort =
    object?.warpMesh?.vDistort !== undefined ? object.warpMesh.vDistort : 0;
  const orientation = object?.warpMesh?.orientation || "horizontal";

  const handlePerspectiveChange = (key, val) => {
    const nextH = key === "horizontal" ? val : horizontal;
    const nextV = key === "vertical" ? val : vertical;
    const nextSX = key === "skewX" ? val : skewX;
    const nextSY = key === "skewY" ? val : skewY;
    const nextCorners =
      nextH === 0 && nextV === 0 && nextSX === 0 && nextSY === 0
        ? null
        : perspectiveParamsToCorners(nextH, nextV, nextSX, nextSY);
    if (edit) {
      edit({ perspectiveCorners: nextCorners });
    }
  };

  const applyWarpPreset = (
    nextPreset,
    nextBend,
    nextHDistort,
    nextVDistort,
    nextOrientation,
  ) => {
    if (nextPreset === "custom") {
      const currentMesh = object?.warpMesh || resampleMeshGrid(null, 3, 3);
      if (editAndCommit) {
        editAndCommit({
          warpMesh: { ...currentMesh, preset: "custom", isCurve: true },
        });
      }
      return;
    }
    const targetBend = nextBend !== 0 ? nextBend : 50;
    const points = generatePhotoshopWarpPreset(
      nextPreset,
      targetBend / 100,
      nextHDistort / 100,
      nextVDistort / 100,
      nextOrientation,
    );
    const nextMesh = {
      cols: 3,
      rows: 3,
      points,
      preset: nextPreset,
      bend: targetBend,
      hDistort: nextHDistort,
      vDistort: nextVDistort,
      orientation: nextOrientation,
      isCurve: true,
    };
    if (editAndCommit) {
      editAndCommit({ warpMesh: nextMesh });
    }
  };

  return (
    <div className="space-y-2.5 px-1 py-0.5">
      {/* 1. Perspective & Skew Controls */}
      {isPerspective && (
        <div className="space-y-1.5">
          {/* Row 1: Horizontal & Vertical Perspective */}
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField
              prefix="H"
              suffix="°"
              min={-100}
              max={100}
              value={horizontal}
              onValueChange={(val) =>
                handlePerspectiveChange("horizontal", val)
              }
              onCommit={() => commitNow?.()}
              ariaLabel={t("editor.transform.warpDistortH")}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
            <ScrubField
              prefix="V"
              suffix="°"
              min={-100}
              max={100}
              value={vertical}
              onValueChange={(val) => handlePerspectiveChange("vertical", val)}
              onCommit={() => commitNow?.()}
              ariaLabel={t("editor.transform.warpDistortV")}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
          </div>
          {/* Row 2: Horizontal & Vertical Skew */}
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField
              prefix="SX"
              suffix="°"
              min={-100}
              max={100}
              value={skewX}
              onValueChange={(val) => handlePerspectiveChange("skewX", val)}
              onCommit={() => commitNow?.()}
              ariaLabel={t("editor.warp.skewX")}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
            <ScrubField
              prefix="SY"
              suffix="°"
              min={-100}
              max={100}
              value={skewY}
              onValueChange={(val) => handlePerspectiveChange("skewY", val)}
              onCommit={() => commitNow?.()}
              ariaLabel={t("editor.warp.skewY")}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
          </div>
        </div>
      )}

      {/* 2. Distort Controls: Warp Style Presets & Parameters */}
      {isDistort && (
        <div className="space-y-2">
          {/* Preset picker: a 6-column icon grid (3 rows of 6) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-neutral-400">
                {t("editor.transform.warpPreset")}
              </span>
              <span className="text-[10px] font-mono text-neutral-500">
                {t(`editor.warp.preset.${preset}`)}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {WARP_STYLE_OPTIONS.map((option) => {
                const active = preset === option;
                const label = t(`editor.warp.preset.${option}`);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    aria-label={label}
                    title={label}
                    onClick={() =>
                      applyWarpPreset(
                        option,
                        bend,
                        hDistort,
                        vDistort,
                        orientation,
                      )
                    }
                    className={`flex aspect-square items-center justify-center rounded-lg transition-colors ${
                      active
                        ? "bg-white text-black"
                        : "bg-[#222222] text-neutral-400 hover:bg-[#2a2a2a] hover:text-white"
                    }`}
                  >
                    <WarpStyleIcon preset={option} className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          {preset !== "custom" && (
            <div className="space-y-1.5 pt-0.5">
              {/* Orientation toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-neutral-400">
                  {t("editor.transform.warpOrientation")}
                </span>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#1a1a1a] p-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      applyWarpPreset(
                        preset,
                        bend,
                        hDistort,
                        vDistort,
                        "horizontal",
                      )
                    }
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-mono transition-colors ${
                      orientation === "horizontal"
                        ? "bg-white text-black font-medium"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    {t("editor.warp.orientation.horizontal")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyWarpPreset(
                        preset,
                        bend,
                        hDistort,
                        vDistort,
                        "vertical",
                      )
                    }
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-mono transition-colors ${
                      orientation === "vertical"
                        ? "bg-white text-black font-medium"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    {t("editor.warp.orientation.vertical")}
                  </button>
                </div>
              </div>

              {/* Bend */}
              <div>
                <ScrubField
                  prefix="B"
                  suffix="%"
                  min={-100}
                  max={100}
                  value={bend}
                  onValueChange={(val) =>
                    applyWarpPreset(
                      preset,
                      val,
                      hDistort,
                      vDistort,
                      orientation,
                    )
                  }
                  onCommit={() => commitNow?.()}
                  ariaLabel={t("editor.transform.bend")}
                  scrubHint={t("editor.props.dragToAdjust")}
                  showRange
                />
              </div>

              {/* H & V Distortion in 2 columns */}
              <div className="grid grid-cols-2 gap-1.5">
                <ScrubField
                  prefix="H"
                  suffix="%"
                  min={-100}
                  max={100}
                  value={hDistort}
                  onValueChange={(val) =>
                    applyWarpPreset(preset, bend, val, vDistort, orientation)
                  }
                  onCommit={() => commitNow?.()}
                  ariaLabel={t("editor.transform.warpDistortH")}
                  scrubHint={t("editor.props.dragToAdjust")}
                  showRange
                />
                <ScrubField
                  prefix="V"
                  suffix="%"
                  min={-100}
                  max={100}
                  value={vDistort}
                  onValueChange={(val) =>
                    applyWarpPreset(preset, bend, hDistort, val, orientation)
                  }
                  onCommit={() => commitNow?.()}
                  ariaLabel={t("editor.transform.warpDistortV")}
                  scrubHint={t("editor.props.dragToAdjust")}
                  showRange
                />
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] leading-4 text-neutral-400">
        {t(detail.hintKey)}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="flex w-full items-center justify-center rounded-xl bg-[#222222] py-1.5 text-[11px] text-neutral-300 transition-all hover:bg-neutral-800 hover:text-white"
      >
        {t("editor.transform.resetWarp")}
      </button>
    </div>
  );
}

WarpSection.propTypes = {
  tool: PropTypes.string.isRequired,
  object: PropTypes.object,
  edit: PropTypes.func,
  editAndCommit: PropTypes.func,
  commitNow: PropTypes.func,
  onReset: PropTypes.func.isRequired,
};
