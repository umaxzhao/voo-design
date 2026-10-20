/**
 * BrandEditorSection — view and edit brand colors, fonts, logo, safe area, and forbidden items.
 *
 * @module agent-panel/brief/BrandEditorSection
 */

import { useState } from "react";
import PropTypes from "prop-types";
import { IconAdd, IconClose, IconTrash } from "../../../icons.jsx";
import { useI18n } from "../../../use_i18n.js";

export default function BrandEditorSection({ brand, onBrandChange }) {
  const { t } = useI18n();
  const [newColorHex, setNewColorHex] = useState("");
  const [newColorRole, setNewColorRole] = useState("");
  const [newFontFamily, setNewFontFamily] = useState("");
  const [newFontRole, setNewFontRole] = useState("");
  const [newForbidden, setNewForbidden] = useState("");

  const handleAddColor = () => {
    const hex = newColorHex.trim();
    if (!hex) return;
    const role = newColorRole.trim();
    const currentColors = brand?.colors || [];
    onBrandChange("colors", [...currentColors, { hex, role }]);
    setNewColorHex("");
    setNewColorRole("");
  };

  const handleRemoveColor = (idx) => {
    const currentColors = brand?.colors || [];
    onBrandChange(
      "colors",
      currentColors.filter((_, i) => i !== idx),
    );
  };

  const handleAddFont = () => {
    const family = newFontFamily.trim();
    if (!family) return;
    const role = newFontRole.trim();
    const currentFonts = brand?.fonts || [];
    onBrandChange("fonts", [...currentFonts, { family, role }]);
    setNewFontFamily("");
    setNewFontRole("");
  };

  const handleRemoveFont = (idx) => {
    const currentFonts = brand?.fonts || [];
    onBrandChange(
      "fonts",
      currentFonts.filter((_, i) => i !== idx),
    );
  };

  const handleAddForbidden = () => {
    const item = newForbidden.trim();
    if (!item) return;
    const current = brand?.forbidden || [];
    if (!current.includes(item)) {
      onBrandChange("forbidden", [...current, item]);
    }
    setNewForbidden("");
  };

  const handleRemoveForbidden = (idx) => {
    const current = brand?.forbidden || [];
    onBrandChange(
      "forbidden",
      current.filter((_, i) => i !== idx),
    );
  };

  return (
    <>
      {/* Brand Colors */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
          {t("agent.brief.brandColors")}
        </label>
        <div className="flex flex-col gap-1">
          {(brand?.colors || []).map((col, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-300"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full border border-white/20"
                  style={{ backgroundColor: col.hex }}
                />
                <span className="font-mono text-[11px]">{col.hex}</span>
                {col.role && (
                  <span className="text-[10px] text-neutral-500">
                    ({col.role})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemoveColor(idx)}
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
            value={newColorHex}
            onChange={(e) => setNewColorHex(e.target.value)}
            placeholder="#hex"
            className="w-20 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <input
            type="text"
            value={newColorRole}
            onChange={(e) => setNewColorRole(e.target.value)}
            placeholder={t("agent.brief.rolePlaceholder")}
            className="flex-1 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <button
            type="button"
            onClick={handleAddColor}
            className="rounded-lg bg-white/[0.06] p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={t("agent.brief.add")}
          >
            <IconAdd size={14} />
          </button>
        </div>
      </div>

      {/* Brand Fonts */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
          {t("agent.brief.brandFonts")}
        </label>
        <div className="flex flex-col gap-1">
          {(brand?.fonts || []).map((f, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-300"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{f.family}</span>
                {f.role && (
                  <span className="text-[10px] text-neutral-500">
                    ({f.role})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemoveFont(idx)}
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
            value={newFontFamily}
            onChange={(e) => setNewFontFamily(e.target.value)}
            placeholder={t("agent.brief.fontFamilyPlaceholder")}
            className="flex-1 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <input
            type="text"
            value={newFontRole}
            onChange={(e) => setNewFontRole(e.target.value)}
            placeholder={t("agent.brief.rolePlaceholder")}
            className="w-24 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <button
            type="button"
            onClick={handleAddFont}
            className="rounded-lg bg-white/[0.06] p-1.5 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={t("agent.brief.add")}
          >
            <IconAdd size={14} />
          </button>
        </div>
      </div>

      {/* Logo Asset ID */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
          {t("agent.brief.logoAssetId")}
        </label>
        <input
          type="text"
          value={brand?.logoAssetId || ""}
          onChange={(e) => onBrandChange("logoAssetId", e.target.value)}
          placeholder="asset-id"
          className="w-full rounded-xl bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
        />
      </div>

      {/* Safe Area */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
          {t("agent.brief.safeArea")} (px)
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          <div>
            <span className="block text-[9px] text-neutral-500 mb-0.5">Top</span>
            <input
              type="number"
              value={brand?.safeArea?.top ?? 0}
              onChange={(e) => onBrandChange("safeArea", { ...brand?.safeArea, top: Number(e.target.value) })}
              className="w-full rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 tabular-nums focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
            />
          </div>
          <div>
            <span className="block text-[9px] text-neutral-500 mb-0.5">Right</span>
            <input
              type="number"
              value={brand?.safeArea?.right ?? 0}
              onChange={(e) => onBrandChange("safeArea", { ...brand?.safeArea, right: Number(e.target.value) })}
              className="w-full rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 tabular-nums focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
            />
          </div>
          <div>
            <span className="block text-[9px] text-neutral-500 mb-0.5">Bottom</span>
            <input
              type="number"
              value={brand?.safeArea?.bottom ?? 0}
              onChange={(e) => onBrandChange("safeArea", { ...brand?.safeArea, bottom: Number(e.target.value) })}
              className="w-full rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 tabular-nums focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
            />
          </div>
          <div>
            <span className="block text-[9px] text-neutral-500 mb-0.5">Left</span>
            <input
              type="number"
              value={brand?.safeArea?.left ?? 0}
              onChange={(e) => onBrandChange("safeArea", { ...brand?.safeArea, left: Number(e.target.value) })}
              className="w-full rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 tabular-nums focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
            />
          </div>
        </div>
      </div>

      {/* Forbidden elements */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
          {t("agent.brief.forbidden")}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(brand?.forbidden || []).map((fb, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300"
            >
              <span>{fb}</span>
              <button
                type="button"
                onClick={() => handleRemoveForbidden(idx)}
                className="text-rose-400 hover:text-rose-200 transition-colors"
                aria-label={t("common.delete")}
              >
                <IconClose size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <input
            type="text"
            value={newForbidden}
            onChange={(e) => setNewForbidden(e.target.value)}
            placeholder={t("agent.brief.forbiddenPlaceholder")}
            className="flex-1 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
          <button
            type="button"
            onClick={handleAddForbidden}
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

BrandEditorSection.propTypes = {
  brand: PropTypes.object,
  onBrandChange: PropTypes.func.isRequired,
  onSafeAreaChange: PropTypes.func.isRequired,
};
