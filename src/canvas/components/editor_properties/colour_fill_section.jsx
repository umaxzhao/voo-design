/** One paint stack; every fill type is edited through its shared swatch. */
import PropTypes from "prop-types";
import { X } from "lucide-react";
import { useRef } from "react";
import { isImageFill, parseTextureFill } from "../../color_picker/texture-fill.js";
import { useI18n } from "../../use_i18n.js";
import { NODE_KIND } from "../../editor/scene_model.js";
import { SectionAddButton, StaticSection } from "./property_section.jsx";
import FillPaintRow from "./fill_paint_row.jsx";
import { fillPaintsOf, fillStackPatch, paintPatch, hasFillContent } from "./fill-paints.js";
export function FillSection({
  object,
  edit,
  editAndCommit,
  commitNow,
  selectedNodes = [],
  getBitmap = null,
  bindings = null,
  fallbackFill = null,
  replaceBitmap = null
}) {
  const {
    t
  } = useI18n();
  const paints = fillPaintsOf(object, fallbackFill);
  const owner = useRef(object.id);
  owner.current = object.id;
  const updatePaint = (index, patch, commit, options) => {
    const nativeBitmap = object.kind === NODE_KIND.IMAGE && index === 0;
    const replacement = nativeBitmap && isImageFill(patch.fill) && !parseTextureFill(patch.fill);
    const paint = paintPatch(patch);
    // The lead image paint follows its node's canonical asset. It must not pin
    // an old imageId after a retouch/repair writes the next bitmap revision.
    if (nativeBitmap) paint.imageId = null;
    if (replacement) paint.fill = "transparent";
    const next = paints.map((entry, at) => at === index ? {
      ...entry,
      ...paint
    } : entry);
    const documentPatch = fillStackPatch(next);
    if (replacement) {
      if (!replaceBitmap) throw new Error("Image replacement requires the editor bitmap operation");
      return replaceBitmap(object.id, patch.fill, {
        resetCrop: true,
        patch: {
          ...documentPatch,
          src: null
        },
        shouldApply: () => owner.current === object.id && (options?.shouldApply?.() ?? true)
      });
    }
    if (nativeBitmap && "imageId" in patch) documentPatch.imageId = patch.imageId;
    if (nativeBitmap && "src" in patch) documentPatch.src = patch.src;
    return (commit ? editAndCommit : edit)(documentPatch);
  };
  const addFill = () => editAndCommit(fillStackPatch([...paints.filter((paint, index) => hasFillContent(paint, index, object)), {
    id: crypto.randomUUID(),
    fill: "#D9D9D9",
    opacity: 1,
    visible: true,
    blendMode: "source-over"
  }]));
  return <StaticSection title={t("editor.props.fillLabel")} storageKey="fill" extra={<SectionAddButton label={t("editor.props.addFill")} onClick={addFill} />}>
    {bindings?.variableName || bindings?.styleName ? <div className="flex flex-wrap items-center gap-1.5">
      {[{
        id: "variable",
        name: bindings.variableName,
        detach: bindings.onDetachVariable
      }, {
        id: "style",
        name: bindings.styleName,
        detach: bindings.onDetachStyle
      }].filter(item => item.name).map(item => <button key={item.id} type="button" onClick={item.detach} className="flex max-w-full items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] text-neutral-300" title={item.name}><span className="truncate">{item.name}</span><X size={10} strokeWidth={1.5} aria-hidden="true" /></button>)}
    </div> : null}
    {paints.filter((paint, index) => hasFillContent(paint, index, object)).map(paint => {
      const index = paints.indexOf(paint);
      return <FillPaintRow key={paint.id} object={{
        ...object,
        fills: undefined,
        fill: paint.fill,
        fillOpacity: paint.opacity,
        fillHidden: paint.visible === false,
        fillBlendMode: paint.blendMode,
        imageId: paint.imageId ?? object.imageId,
        imageScaleMode: paint.imageScaleMode ?? object.imageScaleMode
      }} edit={patch => updatePaint(index, patch, false)} editAndCommit={(patch, options) => updatePaint(index, patch, true, options)} commitNow={commitNow} getBitmap={getBitmap} selectedPaints={selectedNodes.map(node => fillPaintsOf(node)[index])} onRemove={() => editAndCommit(fillStackPatch(paints.filter(item => item.id !== paint.id)))} />;
    })}
    {object.kind === NODE_KIND.IMAGE ? <label className="flex min-h-7 items-center gap-2 rounded-xl bg-neutral-800 px-2.5">
      <span className="shrink-0 text-[9px] text-neutral-400">{t("editor.props.altText")}</span>
      <input key={object.id} defaultValue={object.alt ?? ""} onBlur={event => {
        const alt = event.target.value.trim();
        if (alt !== (object.alt ?? "")) editAndCommit({
          alt
        });
      }} onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
      }} placeholder={t("editor.props.altTextPlaceholder")} aria-label={t("editor.props.altText")} className="min-w-0 flex-1 bg-transparent text-[10px] text-neutral-100 outline-none placeholder:text-neutral-400" />
    </label> : null}
    {object.maskBase ? <span className="text-[11px] text-neutral-400">{t("editor.props.mask")} · {object.maskType ?? "alpha"}</span> : null}
  </StaticSection>;
}
FillSection.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  selectedNodes: PropTypes.array,
  getBitmap: PropTypes.func,
  bindings: PropTypes.object,
  fallbackFill: PropTypes.string,
  replaceBitmap: PropTypes.func
};
