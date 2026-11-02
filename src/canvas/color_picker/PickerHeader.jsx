import PropTypes from "prop-types";
import { Grid2X2, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { IconBucket, IconGradient, IconImage } from "../icons.jsx";
export const PRIMARY_FILL_TYPES = [{
  id: "solid",
  labelKey: "editor.colorPicker.solid",
  Icon: IconBucket
}, {
  id: "gradient",
  labelKey: "editor.colorPicker.gradient",
  Icon: IconGradient
}, {
  id: "image",
  labelKey: "editor.props.imageLabel",
  Icon: IconImage,
  media: true
}, {
  id: "texture",
  labelKey: "editor.fillPicker.texture",
  Icon: Grid2X2,
  media: true
}];

/** One type switcher for the paint editor, with roving keyboard focus. */
export function PickerHeader({
  showTypeTabs,
  activeType,
  onSelectType,
  onClose,
  allowMedia = false,
  panelId
}) {
  const {
    t
  } = useI18n();
  const types = PRIMARY_FILL_TYPES.filter(type => !type.media || allowMedia);
  const navigate = (event, index) => {
    const offsets = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowDown: 1
    };
    const next = event.key === "Home" ? 0 : event.key === "End" ? types.length - 1 : event.key in offsets ? (index + offsets[event.key] + types.length) % types.length : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectType(types[next].id);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  return <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
    {showTypeTabs ? <div role="tablist" aria-label={t("editor.props.fillType")} className="flex items-center gap-1">
      {types.map(({
        id,
        labelKey,
        Icon
      }, index) => <button key={id} type="button" role="tab" id={panelId ? `${panelId}-${id}` : undefined} aria-controls={panelId} aria-selected={activeType === id} tabIndex={activeType === id ? 0 : -1} onClick={() => onSelectType(id)} onKeyDown={event => navigate(event, index)} aria-label={t(labelKey)} title={t(labelKey)} className={`flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mint/40 [@media(pointer:coarse)]:size-12 ${activeType === id ? "bg-white/15 text-white" : "text-neutral-300 hover:bg-white/10 hover:text-white"}`}>
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>)}
    </div> : <span className="text-[12px] font-medium">{t("editor.colorPicker.title")}</span>}
    {onClose ? <button type="button" onClick={onClose} aria-label={t("common.close")} title={t("common.close")} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-mint/40"><X size={14} strokeWidth={1.5} /></button> : null}
  </div>;
}
PickerHeader.propTypes = {
  showTypeTabs: PropTypes.bool.isRequired,
  activeType: PropTypes.string.isRequired,
  onSelectType: PropTypes.func.isRequired,
  onClose: PropTypes.func,
  allowMedia: PropTypes.bool,
  panelId: PropTypes.string
};
