/**
 * ProjectBriefDrawer — view and edit the current project brief.
 *
 * Provides a structured, item-by-item editor for:
 * - Goal, audience, style
 * - Brand guidelines: colors, fonts, logo, safe area, forbidden elements (BrandEditorSection)
 * - Output specs, references (SpecsSection)
 * - Confirmed decisions (DecisionsSection)
 *
 * Compliant with VOO Design System:
 * - No emoji, flat hierarchy, 4px grid, strict border rules, full i18n.
 *
 * @module agent-panel/ProjectBriefDrawer
 */

import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { IconClose, IconFileText } from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";
import {
  createEmptyProjectBrief,
  migrateProjectBrief,
} from "../../agent-runtime/project-brief.js";
import {
  loadGlobalBrands,
  addBrand,
  saveGlobalBrands,
} from "../../agent-runtime/global-memory.js";
import BrandEditorSection from "./brief/BrandEditorSection.jsx";
import SpecsSection from "./brief/SpecsSection.jsx";
import DecisionsSection from "./brief/DecisionsSection.jsx";

export default function ProjectBriefDrawer({
  open,
  onClose,
  brief,
  onSave,
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(() =>
    migrateProjectBrief(brief || createEmptyProjectBrief()),
  );

  const [globalBrands, setGlobalBrands] = useState([]);
  const [savedBrandToast, setSavedBrandToast] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(migrateProjectBrief(brief || createEmptyProjectBrief()));
      setGlobalBrands(loadGlobalBrands());
    }
  }, [open, brief]);

  const handleSaveToBrandLibrary = async () => {
    if (!form.brand) return;
    const existing = loadGlobalBrands();
    const updated = addBrand(existing, {
      ...form.brand,
      name: form.goal ? `${form.goal.slice(0, 20)} Brand` : "Project Brand",
      source: {
        projectId: brief?.projectId || null,
      },
    });
    await saveGlobalBrands(updated);
    setGlobalBrands(updated);
    setSavedBrandToast(true);
    setTimeout(() => setSavedBrandToast(false), 2000);
  };

  if (!open) return null;

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleBrandChange = (brandField, value) => {
    setForm((prev) => ({
      ...prev,
      brand: { ...prev.brand, [brandField]: value },
    }));
  };

  const handleSafeAreaChange = (edge, value) => {
    const num = Number(value);
    setForm((prev) => {
      const currentSa = prev.brand?.safeArea || {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      };
      return {
        ...prev,
        brand: {
          ...prev.brand,
          safeArea: {
            ...currentSa,
            [edge]: isNaN(num) ? 0 : num,
          },
        },
      };
    });
  };

  const handleSave = () => {
    if (typeof onSave === "function") {
      onSave(form);
    }
    if (typeof onClose === "function") {
      onClose();
    }
  };

  return (
    <div
      data-testid="project-brief-drawer"
      className="pointer-events-auto flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/95 px-4 py-3 shadow-panel backdrop-blur-md"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <IconFileText size={16} className="text-neutral-400" />
          <h2 className="text-[12px] font-semibold text-neutral-200">
            {t("agent.brief.title")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[#a7ffd4] px-3 py-1 text-xs font-semibold text-black hover:bg-[#a7ffd4]/90 transition-colors"
          >
            {t("agent.brief.save")}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("agent.brief.close")}
            title={t("agent.brief.close")}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto ui-scroll flex flex-col gap-3 pt-3 pr-1">
        {/* Goal */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
            {t("agent.brief.goal")}
          </label>
          <textarea
            rows={2}
            value={form.goal || ""}
            onChange={(e) => handleFieldChange("goal", e.target.value)}
            placeholder={t("agent.brief.goalPlaceholder")}
            className="w-full rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
        </div>

        {/* Audience */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
            {t("agent.brief.audience")}
          </label>
          <textarea
            rows={2}
            value={form.audience || ""}
            onChange={(e) => handleFieldChange("audience", e.target.value)}
            placeholder={t("agent.brief.audiencePlaceholder")}
            className="w-full rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
        </div>

        {/* Style */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
            {t("agent.brief.style")}
          </label>
          <input
            type="text"
            value={form.style || ""}
            onChange={(e) => handleFieldChange("style", e.target.value)}
            placeholder={t("agent.brief.stylePlaceholder")}
            className="w-full rounded-xl bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
        </div>

        {/* Referenced Brand Selection */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
              {t("agent.brief.referenceBrand")}
            </label>
            {form.brand && (form.brand.colors?.length > 0 || form.brand.fonts?.length > 0) && (
              <button
                type="button"
                onClick={handleSaveToBrandLibrary}
                className="text-[10px] text-[#a7ffd4] hover:underline"
              >
                {savedBrandToast
                  ? t("agent.brief.savedToBrandLibrary")
                  : t("agent.brief.saveToBrandLibrary")}
              </button>
            )}
          </div>
          <select
            value={form.brandRefId || ""}
            onChange={(e) =>
              handleFieldChange("brandRefId", e.target.value || null)
            }
            className="w-full rounded-xl bg-white/[0.06] px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/[0.08] focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          >
            <option value="" className="bg-neutral-900 text-neutral-200">
              {t("agent.brief.noBrandRef")}
            </option>
            {globalBrands.map((b) => (
              <option key={b.id} value={b.id} className="bg-neutral-900 text-neutral-200">
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Brand Editor Section */}
        <BrandEditorSection
          brand={form.brand}
          onBrandChange={handleBrandChange}
          onSafeAreaChange={handleSafeAreaChange}
        />

        {/* Specs & References Section */}
        <SpecsSection
          specs={form.specs}
          references={form.references}
          onFieldChange={handleFieldChange}
        />

        {/* Confirmed Decisions Section */}
        <DecisionsSection
          confirmedDecisions={form.confirmedDecisions}
          onFieldChange={handleFieldChange}
        />
      </div>
    </div>
  );
}

ProjectBriefDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  brief: PropTypes.object,
  onSave: PropTypes.func,
};
