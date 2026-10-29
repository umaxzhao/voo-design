import PropTypes from "prop-types";
import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { ICONS } from "../agent/html_pipeline/lucide.js";

const ICON_NAMES = Object.keys(ICONS);

export default function EditorIconPickerModal({
  open = false,
  onClose,
  onSelectIcon,
}) {
  const { t } = useI18n();
  const searchInputId = useId();
  const [query, setQuery] = useState("");

  const filteredIcons = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ICON_NAMES;
    return ICON_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="icon-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose?.();
      }}
    >
      <div className="relative flex max-h-[80vh] w-[360px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-panel">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h2 id="icon-picker-title" className="text-[15px] font-semibold text-neutral-100">
            {t("editor.menu.insertIcon")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <label htmlFor={searchInputId} className="sr-only">
            {t("common.search")}
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 text-neutral-400" size={15} />
          <input
            id={searchInputId}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            autoFocus
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-8 pr-3 text-xs text-neutral-200 outline-none placeholder:text-neutral-400 focus:border-[#a7ffd4]/50 focus:ring-1 focus:ring-[#a7ffd4]/40"
          />
        </div>

        {/* Icons Grid */}
        <div className="grid max-h-[300px] grid-cols-4 gap-2 overflow-y-auto pr-1">
          {filteredIcons.map((name) => {
            const iconData = ICONS[name];
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onSelectIcon?.(name);
                  onClose?.();
                }}
                className="group flex flex-col items-center justify-center gap-1 rounded-xl p-2 text-neutral-300 transition-colors hover:bg-white/10 hover:text-[#a7ffd4] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dangerouslySetInnerHTML={{
                    __html: iconData.node
                      .map(([tag, attrs]) => {
                        const attrsStr = Object.entries(attrs)
                          .filter(([k]) => k !== "key")
                          .map(([k, v]) => `${k}="${v}"`)
                          .join(" ");
                        return `<${tag} ${attrsStr}></${tag}>`;
                      })
                      .join(""),
                  }}
                />
                <span className="w-full truncate text-center text-[10px] text-neutral-400 group-hover:text-neutral-200">
                  {name}
                </span>
              </button>
            );
          })}
          {filteredIcons.length === 0 && (
            <div className="col-span-4 py-8 text-center text-xs text-neutral-400">
              {t("common.noResults")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

EditorIconPickerModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onSelectIcon: PropTypes.func,
};
