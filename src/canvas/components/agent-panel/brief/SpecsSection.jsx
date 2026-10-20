/**
 * SpecsSection — view and edit output specs and reference asset IDs.
 *
 * @module agent-panel/brief/SpecsSection
 */

import { useState } from "react";
import PropTypes from "prop-types";
import { IconAdd, IconTrash } from "../../../icons.jsx";
import { useI18n } from "../../../use_i18n.js";

export default function SpecsSection({
  specs = [],
  references = [],
  onFieldChange,
}) {
  const { t } = useI18n();
  const [newSpecName, setNewSpecName] = useState("");
  const [newSpecW, setNewSpecW] = useState("");
  const [newSpecH, setNewSpecH] = useState("");
  const [newRef, setNewRef] = useState("");

  const handleAddSpec = () => {
    const w = Number(newSpecW);
    const h = Number(newSpecH);
    if (w <= 0 || h <= 0) return;
    const current = specs || [];
    onFieldChange("specs", [
      ...current,
      {
        name: newSpecName.trim(),
        width: w,
        height: h,
        unit: "px",
      },
    ]);
    setNewSpecName("");
    setNewSpecW("");
    setNewSpecH("");
  };

  const handleRemoveSpec = (idx) => {
    const current = specs || [];
    onFieldChange(
      "specs",
      current.filter((_, i) => i !== idx),
    );
  };

  const handleAddRef = () => {
    const r = newRef.trim();
    if (!r) return;
    const current = references || [];
    if (!current.includes(r)) {
      onFieldChange("references", [...current, r]);
    }
    setNewRef("");
  };

  const handleRemoveRef = (idx) => {
    const current = references || [];
    onFieldChange(
      "references",
      current.filter((_, i) => i !== idx),
    );
  };

  return (
    <>
      {/* Specs */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
          {t("agent.brief.specs")}
        </label>
        <div className="flex flex-col gap-1">
          {(specs || []).map((s, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-300"
            >
              <span>
                {s.name ? `${s.name}: ` : ""}
                <span className="font-mono">
                  {s.width}x{s.height}
                  {s.unit}
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleRemoveSpec(idx)}
                className="text-neutral-500 hover:text-rose-400"
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
            value={newSpecName}
            onChange={(e) => setNewSpecName(e.target.value)}
            placeholder="Name"
            className="flex-1 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <input
            type="number"
            value={newSpecW}
            onChange={(e) => setNewSpecW(e.target.value)}
            placeholder="W"
            className="w-14 rounded-lg bg-white/[0.04] px-2 py-1 text-center font-mono text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <span className="text-neutral-500">x</span>
          <input
            type="number"
            value={newSpecH}
            onChange={(e) => setNewSpecH(e.target.value)}
            placeholder="H"
            className="w-14 rounded-lg bg-white/[0.04] px-2 py-1 text-center font-mono text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <button
            type="button"
            onClick={handleAddSpec}
            className="rounded-lg bg-white/[0.06] p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={t("agent.brief.add")}
          >
            <IconAdd size={14} />
          </button>
        </div>
      </div>

      {/* References */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
          {t("agent.brief.references")}
        </label>
        <div className="flex flex-col gap-1">
          {(references || []).map((ref, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-300"
            >
              <span className="font-mono text-[11px]">{ref}</span>
              <button
                type="button"
                onClick={() => handleRemoveRef(idx)}
                className="text-neutral-500 hover:text-rose-400"
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
            value={newRef}
            onChange={(e) => setNewRef(e.target.value)}
            placeholder="assetId"
            className="flex-1 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <button
            type="button"
            onClick={handleAddRef}
            className="rounded-lg bg-white/[0.06] p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={t("agent.brief.add")}
          >
            <IconAdd size={14} />
          </button>
        </div>
      </div>
    </>
  );
}

SpecsSection.propTypes = {
  specs: PropTypes.array,
  references: PropTypes.array,
  onFieldChange: PropTypes.func.isRequired,
};
