import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { NODE_KIND } from "../../editor/scene_model.js";
import { IconEye, IconEyeOff, IconMinus } from "../../icons.jsx";
import { Swatch, HexField, HEX_COLOUR } from "./colour_swatch.jsx";
import { sectionActionClass, sectionRowClass } from "./property_section.jsx";
import ScrubValueInput from "./scrub_value_input.jsx";
import { opacityPatch } from "../../color_picker/opacity_patch.js";
import { fillTypeOf } from "./fill-paints.js";
import { useFillPreview } from "./use_fill_preview.js";
export default function FillPaintRow({
  object,
  edit,
  editAndCommit,
  commitNow,
  selectedPaints,
  getBitmap,
  onRemove
}) {
  const {
    t
  } = useI18n();
  const preview = useFillPreview(object, getBitmap);
  const nativeImage = object.kind === NODE_KIND.IMAGE && (!object.fill || object.fill === "transparent");
  const type = nativeImage ? "image" : fillTypeOf(object.fill);
  const fillOpacity = Math.round((object.fillOpacity ?? 1) * 100);
  const mixed = selectedPaints.length > 1 && selectedPaints.some(paint => (paint?.opacity ?? 1) !== (selectedPaints[0]?.opacity ?? 1));
  const imagePaint = object.kind === NODE_KIND.IMAGE && (object.imageId || object.src) ? {
    fill: "transparent",
    imageId: object.imageId ?? null,
    src: object.src ?? null,
    imageScaleMode: object.imageScaleMode ?? "fill"
  } : null;
  return <div className={sectionRowClass} data-fill-paint-row>
    <Swatch value={object.fill} onPick={fill => editAndCommit({
      fill
    })} onPaintChange={editAndCommit} ariaLabel={t("editor.props.fill")} allowMedia previewImage={preview} isImage={type === "image" || type === "texture"} imageScaleMode={object.imageScaleMode ?? "fill"} imagePaint={imagePaint} opacity={mixed ? null : fillOpacity} onOpacityChange={mixed ? null : value => edit(opacityPatch("fillOpacity", value))} onOpacityCommit={commitNow} blendMode={object.fillBlendMode ?? "source-over"} onBlendModeChange={fillBlendMode => editAndCommit({
      fillBlendMode
    })} />
    {type === "solid" && HEX_COLOUR.test(object.fill) ? <HexField value={object.fill} onCommit={fill => editAndCommit({
      fill
    })} ariaLabel={t("editor.props.customColour")} /> : <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-300">{type === "image" ? t("editor.props.imageLabel") : type === "texture" ? t("editor.fillPicker.texture") : t("editor.props.gradientLabel")}</span>}
    <div className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-2">
      {mixed ? <span className="text-[11px] text-neutral-400" title={t("editor.props.mixedValues")}>—%</span> : <>
        <ScrubValueInput min={0} max={100} step={1} value={fillOpacity} format={value => `${value}`} onChange={value => edit(opacityPatch("fillOpacity", value))} onCommit={commitNow} ariaLabel={t("editor.props.opacity")} scrubHint={t("editor.props.dragToAdjust")} className="!w-7 !p-0 bg-transparent text-right text-[11px] tabular-nums text-neutral-300 outline-none" />
        <span className="text-[10px] text-neutral-400">%</span>
      </>}
      <button type="button" aria-label={t("editor.fillPicker.visibility")} aria-pressed={object.fillHidden !== true} title={t("editor.panel.fillVisible")} onClick={() => editAndCommit({
        fillHidden: object.fillHidden !== true
      })} className={sectionActionClass}>
        {object.fillHidden ? <IconEyeOff size={12} strokeWidth={1.5} /> : <IconEye size={12} strokeWidth={1.5} />}
      </button>
      <button type="button" onClick={onRemove} title={t("editor.props.removeFill")} aria-label={t("editor.props.removeFill")} className={sectionActionClass}><IconMinus size={12} strokeWidth={1.5} /></button>
    </div>
  </div>;
}
FillPaintRow.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  selectedPaints: PropTypes.array.isRequired,
  getBitmap: PropTypes.func,
  onRemove: PropTypes.func.isRequired
};
