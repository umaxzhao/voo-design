/**
 * Transform section: reference-point anchor, position (X/Y), dimension (W/H),
 * rotation, shear, horizontal/vertical flip, and corner radius.
 */
import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Contrast } from "lucide-react";
import ScrubField from "../scrub_field.jsx";
import MixedField from "./mixed_field.jsx";
import FlatSelect from "../flat_select.jsx";
import { normalizeAutoLayout } from "../../editor/scene_auto_layout.js";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { StaticSection } from "./property_section.jsx";
import {
  MAX_SHEAR_DEG,
} from "../../editor/scene_model_core.js";
import {
  anchorDocPoint,
  resizeWithAnchor,
} from "../../editor/scene_geometry.js";
import {
  IconFlipH,
  IconFlipV,
  IconRotateCw,
} from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";
import EditorTooltip from "../editor_tooltip.jsx";
import AnchorPointGrid from "./transform_anchor_grid.jsx";
import TransformDimensionBar from "./transform_dimension_bar.jsx";
import TransformRadiusControls from "./transform_radius_controls.jsx";
export { AnchorPointGrid, TransformDimensionBar, TransformRadiusControls };
/** Largest value the position/size fields accept — comfortably past any doc. */
const COORD_LIMIT = 99999;
/**
 * The always-visible block: region label, position, size and opacity.
 *
 * `lockRatio` lives here rather than in the panel shell, so the hook sits at
 * the top of the component that actually uses it instead of above the shell's
 * early returns.
 */
export default function TransformSection({
  object,
  showRadius = true,
  showDimensions = true,
  docSize: _docSize = null,
  isRegion = false,
  edit,
  editAndCommit,
  commitNow = undefined,
  selectedNodes = [],
  transformActions = null,
  parentLayout = null,
  onRotate90 = null,
  positionAction = null,
}) {
  const { t } = useI18n();
  const [lockRatioState, setLockRatioState] = useState({
    objectId: object.id,
    lockRatio: object.lockRatio ?? !object.isFrame,
  });
  const lockRatio =
    lockRatioState.objectId === object.id
      ? lockRatioState.lockRatio
      : (object.lockRatio ?? !object.isFrame);
  const setLockRatio = (nextLock) =>
    setLockRatioState({ objectId: object.id, lockRatio: nextLock });
  useEffect(() => {
    setLockRatioState({
      objectId: object.id,
      lockRatio: object.lockRatio ?? !object.isFrame,
    });
  }, [object.id, object.lockRatio, object.isFrame]);
  const [anchor, setAnchor] = useState("nw");
  /**
   * Common value for a transform field across the selection (plan 1.9).
   * Single selection falls back to the primary node's value; a multi
   * selection whose members disagree shows a dash instead of a number.
   */
  const multi = selectedNodes.length > 1;
  const common = (key, fallback) => {
    if (!multi) return { value: fallback, mixed: false };
    // Sparse/older nodes use the same effective defaults as the renderer.
    const value = commonValue(selectedNodes, key, key === "opacity" ? 1 : 0);
    return value === MIXED
      ? { value: null, mixed: true }
      : { value, mixed: false };
  };
  // Declared before use: X/Y report the anchor's document position, and
  // commonX/commonY read it on first render (TDZ otherwise).
  const anchorPoint = anchorDocPoint(object, anchor);
  const commonX = common("x", Math.round(anchorPoint.x));
  const commonY = common("y", Math.round(anchorPoint.y));
  const commonW = common("width", Math.round(object.width ?? 0));
  const commonH = common("height", Math.round(object.height ?? 0));
  const commonR = common("rotation", Math.round(object.rotation ?? 0));
  const commonOpacity = common("opacity", object.opacity ?? 1);
  const commonS = common("shear", Math.round(object.shear ?? 0));
  const commonCornerRadius = common("cornerRadius", object.cornerRadius);
  // X/Y report and edit the anchor's document position, not always the
  // top-left corner — with the default "nw" anchor they are exactly x and y.
  const editPosition = (axis, value) => {
    edit(resizeWithAnchor(object, { [axis]: value }, anchor));
  };
  const resizeTo = (axis, value) => {
    const currentW = object.width;
    const currentH = object.height;
    if (!currentW || !currentH) return;
    if (object.kind === "text") {
      // A fixed text box (drawn with the text tool) has an independent wrap
      // column: W edits that column, and its height is auto — it grows with
      // the lines — so H does nothing. Point text has no box of its own, so
      // its W/H edits scale the font and let the measurement follow.
      if (object.boxWidth > 0) {
        if (axis === "width") {
          const resized = resizeWithAnchor(object, { width: value }, anchor);
          edit({ x: resized.x, boxWidth: value });
        }
        return;
      }
      const scaleFrom = axis === "width" ? currentW : currentH;
      const nextFontSize = Math.max(4, (object.fontSize * value) / scaleFrom);
      // Compute estimated text box dimensions with new font size
      const scaleRatio = nextFontSize / object.fontSize;
      const nextW = Math.max(1, Math.round(currentW * scaleRatio));
      const nextH = Math.max(1, Math.round(currentH * scaleRatio));
      const resized = resizeWithAnchor(
        object,
        { width: nextW, height: nextH },
        anchor,
      );
      edit({ x: resized.x, y: resized.y, fontSize: nextFontSize });
      return;
    }
    if (lockRatio && currentH > 0) {
      const ratio = currentW / currentH;
      if (axis === "width") {
        const nextH = Math.max(1, Math.round(value / ratio));
        edit(resizeWithAnchor(object, { width: value, height: nextH }, anchor));
      } else {
        const nextW = Math.max(1, Math.round(value * ratio));
        edit(resizeWithAnchor(object, { width: nextW, height: value }, anchor));
      }
    } else {
      edit(resizeWithAnchor(object, { [axis]: value }, anchor));
    }
  };
  return (
    <>
      <StaticSection title={t("editor.props.transform")} storageKey="transform" extra={positionAction}>
        <div data-transform-position className="flex items-start gap-2">
          {isRegion ? null : (
            <AnchorPointGrid
              value={anchor}
              onChange={setAnchor}
              label={t("editor.props.anchorPoint")}
            />
          )}
          <div className="min-w-0 flex-1 space-y-2.5">
            <div data-transform-position-fields className="grid grid-cols-2 gap-2">
              {commonX.mixed ? (
                <MixedField
                  label="X"
                  min={-COORD_LIMIT}
                  max={COORD_LIMIT}
                  ariaLabel="X"
                  onValueChange={(value) => editPosition("x", value)}
                  commitNow={commitNow}
                />
              ) : (
                <ScrubField
                  key={`${object.id}:x`}
                  prefix="X"
                  min={-COORD_LIMIT} max={COORD_LIMIT} value={commonX.value}
                  onValueChange={(value) => editPosition("x", value)} onCommit={commitNow}
                  ariaLabel="X" scrubHint={t("editor.props.dragToAdjust")}
                />
              )}
              {commonY.mixed ? (
                <MixedField
                  label="Y"
                  min={-COORD_LIMIT}
                  max={COORD_LIMIT}
                  ariaLabel="Y"
                  onValueChange={(value) => editPosition("y", value)}
                  commitNow={commitNow}
                />
              ) : (
                <ScrubField
                  key={`${object.id}:y`}
                  prefix="Y"
                  min={-COORD_LIMIT} max={COORD_LIMIT} value={commonY.value}
                  onValueChange={(value) => editPosition("y", value)} onCommit={commitNow}
                  ariaLabel="Y" scrubHint={t("editor.props.dragToAdjust")}
                />
              )}
            </div>
            {/* Keep editable W/H beside position for every transformable object. */}
            {showDimensions ? (
              <TransformDimensionBar
                commonW={commonW}
                commonH={commonH}
                lockRatio={lockRatio}
                setLockRatio={setLockRatio}
                resizeTo={resizeTo}
                edit={edit}
                commitNow={commitNow}
                t={t}
              />
            ) : null}
          </div>
        </div>
        {isRegion ? null : (
          <div data-transform-rotation className="flex items-center gap-2">
            <div data-transform-angle-fields className="grid min-w-0 flex-1 grid-cols-2 gap-2">
              {commonR.mixed ? (
                <MixedField
                  label="R"
                  suffix="°"
                  min={-180}
                  max={180}
                  ariaLabel={t("editor.props.rotation")}
                  onValueChange={(value) => edit({ rotation: value })}
                  commitNow={commitNow}
                />
              ) : (
                <ScrubField
                  prefix="R" suffix="°"
                  min={-180} max={180} value={commonR.value}
                  onValueChange={(value) => edit({ rotation: value })} onCommit={commitNow}
                  ariaLabel={t("editor.props.rotation")} scrubHint={t("editor.props.dragToAdjust")}
                />
              )}
              {commonS.mixed ? (
                <MixedField
                  label="S"
                  suffix="°"
                  min={-MAX_SHEAR_DEG}
                  max={MAX_SHEAR_DEG}
                  ariaLabel={t("editor.props.shear")}
                  onValueChange={(value) => edit({ shear: value })}
                  commitNow={commitNow}
                />
              ) : (
                <ScrubField
                  prefix="S" suffix="°" min={-MAX_SHEAR_DEG} max={MAX_SHEAR_DEG}
                  value={commonS.value} onValueChange={(value) => edit({ shear: value })}
                  onCommit={commitNow} ariaLabel={t("editor.props.shear")} scrubHint={t("editor.props.dragToAdjust")}
                />
              )}
            </div>
            <div data-transform-actions className="flex items-center gap-1 shrink-0">
              <EditorTooltip title={t("editor.props.rotate90")} side="top">
                <button
                  type="button"
                  disabled={Boolean(transformActions?.pending)}
                  onClick={() => onRotate90?.()}
                  aria-label={t("editor.props.rotate90")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:pointer-events-none disabled:opacity-40"
                >
                  <IconRotateCw size={14} />
                </button>
              </EditorTooltip>
              <EditorTooltip title={t("editor.props.flipH")} side="top">
                <button
                  type="button"
                  disabled={Boolean(transformActions?.pending)}
                  onClick={() => transformActions?.onTransform ? transformActions.onTransform("flipH") : editAndCommit({ flipH: !object.flipH })}
                  aria-label={t("editor.props.flipH")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:pointer-events-none disabled:opacity-40"
                >
                  <IconFlipH size={14} />
                </button>
              </EditorTooltip>
              <EditorTooltip title={t("editor.props.flipV")} side="top">
                <button
                  type="button"
                  disabled={Boolean(transformActions?.pending)}
                  onClick={() => transformActions?.onTransform ? transformActions.onTransform("flipV") : editAndCommit({ flipV: !object.flipV })}
                  aria-label={t("editor.props.flipV")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:pointer-events-none disabled:opacity-40"
                >
                  <IconFlipV size={14} />
                </button>
              </EditorTooltip>
            </div>
          </div>
        )}
        {/* Opacity and blend mode live in the Appearance section (Figma/Pen). */}
        {(() => {
          if (!showDimensions) return null;
          const isGroup = object.kind === "group";
          const frameLayout = isGroup ? normalizeAutoLayout(object.autoLayout) : null;
          const childOfLayout = Boolean(parentLayout) && !isGroup;
          if (!frameLayout && !childOfLayout) return null;
          const widthKey = frameLayout ? "widthMode" : "layoutWidth";
          const heightKey = frameLayout ? "heightMode" : "layoutHeight";
          const widthValue = frameLayout
            ? frameLayout.widthMode
            : object.layoutWidth ?? "fixed";
          const heightValue = frameLayout
            ? frameLayout.heightMode
            : object.layoutHeight ?? "fixed";
          const options = frameLayout
            ? ["fixed", "hug"]
            : ["fixed", "hug", "fill"];
          const commitMode = (key, value) => {
            if (frameLayout) {
              editAndCommit({
                autoLayout: { ...frameLayout, [key]: value },
              });
            } else {
              editAndCommit({ [key]: value });
            }
          };
          return (
            <div className="grid grid-cols-2 gap-2">
              {[
                ["width", widthKey, widthValue, t("editor.props.sizingWidth")],
                ["height", heightKey, heightValue, t("editor.props.sizingHeight")],
              ].map(([axis, key, value, label]) => (
                <FlatSelect
                  key={axis}
                  value={value}
                  onChange={(next) => commitMode(key, next)}
                  label={label}
                  options={options.map((option) => ({
                    value: option,
                    label: t(`editor.sizing.${option}`),
                  }))}
                  triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2 !text-[10px] !font-mono !uppercase !text-neutral-100 hover:!bg-neutral-800/80"
                  widthClass="w-full"
                />
              ))}
            </div>
          );
        })()}
        {showRadius && (object.kind === "rect" || object.isFrame || object.kind === "frame") ? (
          <TransformRadiusControls
            object={object}
            commonCornerRadius={commonCornerRadius}
            edit={edit}
            editAndCommit={editAndCommit}
            commitNow={commitNow}
            t={t}
          />
        ) : null}
        {(object.warpMesh || object.perspectiveCorners) && (
          <div>
            <button
              type="button"
              onClick={() => {
                editAndCommit({ warpMesh: null, perspectiveCorners: null });
              }}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] text-[11px] text-neutral-300 transition-colors hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
            >
              <span>{t("editor.transform.resetWarp")}</span>
            </button>
          </div>
        )}
      </StaticSection>
    </>
  );
}
TransformSection.propTypes = {
  positionAction: PropTypes.node,
  onRotate90: PropTypes.func,
  object: PropTypes.object.isRequired,
  showRadius: PropTypes.bool,
  /** False when the Layout group owns the W/H fields (frames). */
  showDimensions: PropTypes.bool,
  docSize: PropTypes.shape({ width: PropTypes.number, height: PropTypes.number }),
  isRegion: PropTypes.bool,
  tool: PropTypes.string,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  selectedNodes: PropTypes.array,
  transformActions: PropTypes.shape({ pending: PropTypes.bool, onTransform: PropTypes.func }),
  onMode: PropTypes.func,
  maskActions: PropTypes.shape({
    busy: PropTypes.bool,
    supported: PropTypes.bool,
    hasMask: PropTypes.bool,
    onRemove: PropTypes.func,
    onClear: PropTypes.func,
  }),
};
