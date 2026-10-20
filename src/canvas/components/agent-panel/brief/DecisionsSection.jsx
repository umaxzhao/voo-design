/**
 * DecisionsSection — view and edit confirmed decisions.
 *
 * @module agent-panel/brief/DecisionsSection
 */

import { useState } from "react";
import PropTypes from "prop-types";
import { IconAdd, IconTrash } from "../../../icons.jsx";
import { useI18n } from "../../../use_i18n.js";

export default function DecisionsSection({
  confirmedDecisions = [],
  onFieldChange,
}) {
  const { t } = useI18n();
  const [newDecision, setNewDecision] = useState("");

  const handleAddDecision = () => {
    const text = newDecision.trim();
    if (!text) return;
    const current = confirmedDecisions || [];
    onFieldChange("confirmedDecisions", [
      ...current,
      { text, source: "user", confirmedAt: Date.now() },
    ]);
    setNewDecision("");
  };

  const handleRemoveDecision = (idx) => {
    const current = confirmedDecisions || [];
    onFieldChange(
      "confirmedDecisions",
      current.filter((_, i) => i !== idx),
    );
  };

  return (
    <div className="flex flex-col gap-1.5 pb-4">
      <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
        {t("agent.brief.confirmedDecisions")}
      </label>
      <div className="flex flex-col gap-1">
        {(confirmedDecisions || []).map((dec, idx) => (
          <div
            key={idx}
            className="flex items-start justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs text-neutral-300"
          >
            <div className="flex flex-col gap-0.5 pr-2">
              <span>{dec.text}</span>
              <span className="text-[9px] text-neutral-500">{dec.source}</span>
            </div>
            <button
              type="button"
              onClick={() => handleRemoveDecision(idx)}
              className="text-neutral-500 hover:text-rose-400 pt-0.5"
              aria-label={t("agent.brief.delete")}
            >
              <IconTrash size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        <input
          type="text"
          value={newDecision}
          onChange={(e) => setNewDecision(e.target.value)}
          placeholder={t("agent.brief.decisionPlaceholder")}
          className="flex-1 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
        />
        <button
          type="button"
          onClick={handleAddDecision}
          className="rounded-lg bg-white/[0.06] p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
          aria-label={t("agent.brief.add")}
        >
          <IconAdd size={14} />
        </button>
      </div>
    </div>
  );
}

DecisionsSection.propTypes = {
  confirmedDecisions: PropTypes.array,
  onFieldChange: PropTypes.func.isRequired,
};
