import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";

export default function FrameSlotSection({ object, editAndCommit }) {
  const { t } = useI18n();
  const [newRecommendation, setNewRecommendation] = useState("");

  if (!object || (!object.isFrame && object.kind !== "frame" && object.kind !== "group")) {
    return null;
  }

  const currentSlots = Array.isArray(object.slot)
    ? object.slot
    : typeof object.slot === "string" && object.slot
      ? [object.slot]
      : [];

  const handleAdd = () => {
    const val = newRecommendation.trim();
    if (!val || currentSlots.includes(val)) return;
    const next = [...currentSlots, val];
    editAndCommit({ slot: next });
    setNewRecommendation("");
  };

  const handleRemove = (item) => {
    const next = currentSlots.filter((s) => s !== item);
    editAndCommit({ slot: next.length > 0 ? next : null });
  };

  const handleClear = () => {
    editAndCommit({ slot: null });
  };

  return (
    <StaticSection testId="frame-slot-section" title={t("editor.props.componentSlot")} storageKey="frame-slot">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-400">
            {t("editor.props.slotRecommendations")}
          </span>
          {currentSlots.length > 0 ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-[9px] font-mono text-neutral-500 hover:text-white transition-colors cursor-pointer"
            >
              {t("editor.props.clearSlot")}
            </button>
          ) : null}
        </div>

        {currentSlots.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {currentSlots.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-2 py-0.5 text-[10px] font-mono text-neutral-200"
              >
                <span>{item}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  aria-label={t("editor.panel.removeSlot", { name: item })}
                  className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="px-1 text-[10px] leading-4 text-neutral-400">
            {t("editor.props.noSlotRecommendations")}
          </p>
        )}

        <div className="flex items-center gap-1.5 mt-0.5">
          <input
            type="text"
            value={newRecommendation}
            onChange={(e) => setNewRecommendation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder={t("editor.props.addSlotPlaceholder")}
            className="h-6 min-w-0 flex-1 rounded-lg bg-[#222222] px-2 text-[10px] font-mono text-neutral-200 outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newRecommendation.trim()}
            className="h-6 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-medium text-neutral-200 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
    </StaticSection>
  );
}

FrameSlotSection.propTypes = {
  object: PropTypes.object,
  editAndCommit: PropTypes.func.isRequired,
};
