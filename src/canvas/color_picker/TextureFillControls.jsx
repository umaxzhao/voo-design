import PropTypes from "prop-types";
import FlatSelect from "../components/flat_select.jsx";
import { HexField } from "../components/editor_properties/paint_hex_field.jsx";
import { useI18n } from "../use_i18n.js";
import { formatTextureFill, normalizeTexture, parseTextureFill, TEXTURE_PATTERNS } from "./texture-fill.js";
export default function TextureFillControls({
  value,
  onChange
}) {
  const {
    t
  } = useI18n();
  const texture = parseTextureFill(value) ?? normalizeTexture();
  const patch = next => onChange({
    ...texture,
    ...next
  });
  return <div className="flex flex-col gap-3" data-testid="fill-texture-controls">
    <div className="h-24 rounded-xl bg-neutral-800" aria-hidden="true" style={{
      backgroundImage: `url("${formatTextureFill(texture)}")`
    }} />
    <FlatSelect value={texture.pattern} onChange={pattern => patch({
      pattern
    })} label={t("editor.fillPicker.pattern")} options={TEXTURE_PATTERNS.map(pattern => ({
      value: pattern,
      label: t(`editor.fillPicker.pattern.${pattern}`)
    }))} triggerClassName="!w-full !rounded-xl !bg-neutral-800 !text-[11px]" portal panelClassName="!z-[300]" />
    <label className="flex min-h-8 items-center gap-2 text-[11px] text-neutral-200">
      <span>{t("editor.fillPicker.textureScale")}</span>
      <input key={texture.scale} type="number" min={25} max={400} step={5} defaultValue={texture.scale} aria-label={t("editor.fillPicker.textureScale")} className="min-w-0 flex-1 rounded-lg bg-neutral-800 px-2 py-1 text-right tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-mint/40" onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
      }} onBlur={event => {
        const number = Number(event.target.value);
        if (event.target.value.trim() && Number.isFinite(number)) patch({
          scale: number
        });else event.target.value = String(texture.scale);
      }} /><span>%</span>
    </label>
    <label className="flex min-h-8 items-center gap-2 rounded-xl bg-neutral-800 px-2 text-[11px] text-neutral-200">
      <span>{t("editor.fillPicker.textureColour")}</span>
      <HexField value={texture.color} onCommit={color => patch({
        color
      })} ariaLabel={t("editor.fillPicker.textureColour")} />
    </label>
  </div>;
}
TextureFillControls.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired
};
