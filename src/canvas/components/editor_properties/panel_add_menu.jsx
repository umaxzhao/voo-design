/**
 * The panel's single add entry. Everything that is not part of the default
 * set for the current selection (effects, live filters, modifiers, variables,
 * styles, constraints, export) hides behind this one compact "+ Add" row and
 * only becomes a section once the user picks it.
 */

import PropTypes from "prop-types";
import { useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { sectionRowClass } from "./property_section.jsx";

const ITEM_CLASS =
  "block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-neutral-200 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

export default function PanelAddMenu({ items, defaultOpen = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;
  return (
    <div className="mt-2.5 border-t border-white/10 pt-2.5" data-testid="properties-add-menu">
      <button
        type="button"
        aria-expanded={open}
        data-inspector-control="action"
        aria-haspopup="menu"
        aria-label={t("editor.panel.addMenu")}
        onClick={() => setOpen((value) => !value)}
        className={`${sectionRowClass} cursor-pointer text-[11px] font-mono text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40`}
      >
        <span aria-hidden="true">+</span>
        <span className="min-w-0 flex-1 truncate text-left uppercase">{t("editor.panel.add")}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="mt-1 rounded-xl border border-white/10 bg-neutral-900 p-1"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-testid={`properties-add-${item.key}`}
              className={ITEM_CLASS}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

PanelAddMenu.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      onSelect: PropTypes.func.isRequired,
    }),
  ).isRequired,
  defaultOpen: PropTypes.bool,
};
