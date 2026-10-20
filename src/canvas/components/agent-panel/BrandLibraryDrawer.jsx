/**
 * BrandLibraryDrawer — view and manage cross-project global brands.
 *
 * Compliant with VOO Design System:
 * - No emoji, flat hierarchy, 4px grid, strict border rules, full i18n.
 *
 * @module agent-panel/BrandLibraryDrawer
 */

import { useState } from "react";
import PropTypes from "prop-types";
import { IconPalette, IconClose, IconTrash, IconAdd } from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";
import {
  createEmptyBrand,
  sanitizeBrand,
} from "../../agent-runtime/global-memory.js";

export default function BrandLibraryDrawer({
  open,
  onClose,
  brands = [],
  onAddBrand,
  onUpdateBrand,
  onDeleteBrand,
}) {
  const { t } = useI18n();
  const [editingBrand, setEditingBrand] = useState(null);
  const [newColorHex, setNewColorHex] = useState("");
  const [newColorRole, setNewColorRole] = useState("");
  const [newFontFamily, setNewFontFamily] = useState("");
  const [newFontRole, setNewFontRole] = useState("");
  const [newForbidden, setNewForbidden] = useState("");

  if (!open) return null;

  const handleSaveEditing = () => {
    if (!editingBrand) return;
    const sanitized = sanitizeBrand(editingBrand);
    if (!sanitized.name.trim()) return;

    const exists = brands.some((b) => b.id === sanitized.id);
    if (exists && typeof onUpdateBrand === "function") {
      onUpdateBrand(sanitized.id, sanitized);
    } else if (typeof onAddBrand === "function") {
      onAddBrand(sanitized);
    }
    setEditingBrand(null);
  };

  const handleAddColor = () => {
    const hex = newColorHex.trim();
    if (!hex || !editingBrand) return;
    const colors = [...(editingBrand.colors || []), { hex, role: newColorRole.trim() }];
    setEditingBrand({ ...editingBrand, colors });
    setNewColorHex("");
    setNewColorRole("");
  };

  const handleAddFont = () => {
    const family = newFontFamily.trim();
    if (!family || !editingBrand) return;
    const fonts = [...(editingBrand.fonts || []), { family, role: newFontRole.trim() }];
    setEditingBrand({ ...editingBrand, fonts });
    setNewFontFamily("");
    setNewFontRole("");
  };

  const handleAddForbidden = () => {
    const item = newForbidden.trim();
    if (!item || !editingBrand) return;
    setEditingBrand({ ...editingBrand, forbidden: [...(editingBrand.forbidden || []), item] });
    setNewForbidden("");
  };

  return (
    <div
      data-testid="brand-library-drawer"
      className="pointer-events-auto flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/95 px-4 py-3 shadow-panel backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <IconPalette size={16} className="text-neutral-400" />
          <h2 className="text-[12px] font-semibold text-neutral-200">
            {t("agent.brandLibrary.title")}
          </h2>
          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-400">
            {brands.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!editingBrand && (
            <button
              type="button"
              onClick={() => setEditingBrand(createEmptyBrand({ name: "" }))}
              className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-neutral-300 hover:bg-white/[0.1] hover:text-white transition-colors"
            >
              <IconAdd size={12} />
              <span>{t("agent.brandLibrary.newBrand")}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("agent.brandLibrary.close")}
            title={t("agent.brandLibrary.close")}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto ui-scroll flex flex-col gap-3 pt-3 pr-1">
        {editingBrand ? (
          <div className="flex flex-col gap-3 rounded-xl bg-white/[0.04] p-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                {t("agent.brief.title")}
              </label>
              <input
                type="text"
                value={editingBrand.name || ""}
                onChange={(e) => setEditingBrand({ ...editingBrand, name: e.target.value })}
                placeholder="Brand Name"
                className="w-full rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
              />
            </div>

            {/* Colors */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                {t("agent.brief.brandColors")}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(editingBrand.colors || []).map((col, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-300">
                    <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: col.hex }} />
                    <span className="font-mono text-[10px]">{col.hex}</span>
                    {col.role && <span className="text-[10px] text-neutral-500">({col.role})</span>}
                    <button
                      type="button"
                      onClick={() => setEditingBrand({ ...editingBrand, colors: editingBrand.colors.filter((_, i) => i !== idx) })}
                      className="text-neutral-500 hover:text-rose-400"
                    >
                      <IconClose size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newColorHex}
                  onChange={(e) => setNewColorHex(e.target.value)}
                  placeholder="#000000"
                  className="w-20 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400"
                />
                <input
                  type="text"
                  value={newColorRole}
                  onChange={(e) => setNewColorRole(e.target.value)}
                  placeholder="role"
                  className="w-24 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400"
                />
                <button type="button" onClick={handleAddColor} className="rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-300 hover:text-white">
                  {t("agent.brief.add")}
                </button>
              </div>
            </div>

            {/* Fonts */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                {t("agent.brief.brandFonts")}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(editingBrand.fonts || []).map((f, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-300">
                    <span>{f.family}</span>
                    {f.role && <span className="text-[10px] text-neutral-500">({f.role})</span>}
                    <button
                      type="button"
                      onClick={() => setEditingBrand({ ...editingBrand, fonts: editingBrand.fonts.filter((_, i) => i !== idx) })}
                      className="text-neutral-500 hover:text-rose-400"
                    >
                      <IconClose size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newFontFamily}
                  onChange={(e) => setNewFontFamily(e.target.value)}
                  placeholder="Font family"
                  className="w-28 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400"
                />
                <input
                  type="text"
                  value={newFontRole}
                  onChange={(e) => setNewFontRole(e.target.value)}
                  placeholder="role"
                  className="w-20 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400"
                />
                <button type="button" onClick={handleAddFont} className="rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-300 hover:text-white">
                  {t("agent.brief.add")}
                </button>
              </div>
            </div>

            {/* Forbidden */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                {t("agent.brief.forbidden")}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(editingBrand.forbidden || []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 text-rose-400 px-2 py-1 text-[11px]">
                    <span>{item}</span>
                    <button
                      type="button"
                      onClick={() => setEditingBrand({ ...editingBrand, forbidden: editingBrand.forbidden.filter((_, i) => i !== idx) })}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      <IconClose size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newForbidden}
                  onChange={(e) => setNewForbidden(e.target.value)}
                  placeholder="forbidden item"
                  className="w-36 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-neutral-200 placeholder-neutral-400"
                />
                <button type="button" onClick={handleAddForbidden} className="rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-300 hover:text-white">
                  {t("agent.brief.add")}
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditingBrand(null)}
                className="rounded-lg bg-white/[0.06] px-3 py-1 text-[11px] text-neutral-300 hover:text-white"
              >
                {t("agent.brandLibrary.close")}
              </button>
              <button
                type="button"
                onClick={handleSaveEditing}
                className="rounded-lg bg-[#a7ffd4] px-3 py-1 text-[11px] font-medium text-black hover:bg-[#a7ffd4]/90"
              >
                {t("agent.brief.save")}
              </button>
            </div>
          </div>
        ) : brands.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500">
            <IconPalette size={24} className="mb-2 text-neutral-500" />
            <p className="text-xs font-medium text-neutral-400">
              {t("agent.brandLibrary.empty")}
            </p>
            <p className="text-[11px] mt-1 max-w-xs text-neutral-500">
              {t("agent.brandLibrary.emptyHint")}
            </p>
          </div>
        ) : (
          brands.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-2 rounded-xl bg-white/[0.04] p-3 hover:bg-white/[0.07] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-neutral-200">
                    {b.name}
                  </span>
                  {b.source?.projectName && (
                    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-neutral-400">
                      {b.source.projectName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingBrand(b)}
                    className="rounded-lg px-2 py-0.5 text-[10px] text-neutral-400 hover:text-white hover:bg-white/[0.08]"
                  >
                    {t("agent.brandLibrary.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteBrand?.(b.id)}
                    aria-label={t("agent.brandLibrary.delete")}
                    title={t("agent.brandLibrary.delete")}
                    className="flex h-5 w-5 items-center justify-center rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <IconTrash size={12} />
                  </button>
                </div>
              </div>

              {b.colors?.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {b.colors.map((c, i) => (
                    <span
                      key={i}
                      title={c.role ? `${c.hex} (${c.role})` : c.hex}
                      className="h-3 w-3 rounded-full border border-white/20"
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              )}

              {b.forbidden?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {b.forbidden.map((f, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[9px] text-rose-400"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

BrandLibraryDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  brands: PropTypes.arrayOf(PropTypes.object),
  onAddBrand: PropTypes.func,
  onUpdateBrand: PropTypes.func,
  onDeleteBrand: PropTypes.func,
};
