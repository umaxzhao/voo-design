import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import { designSystemName } from "../editor/design_system_registry.js";

/** Cards visible before "Show more". */
export const COLLAPSED_COUNT = 4;
const MAX_COVER_COLORS = 6;

const CARD_BASE =
  "flex w-full min-w-0 flex-col gap-2 rounded-xl border bg-white/[0.04] p-2 text-left outline-none transition-colors hover:bg-white/[0.07] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";
const BADGE_CLASS = "shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] text-neutral-400";
const MORE_CLASS =
  "min-h-12 self-start rounded-lg bg-white/10 px-4 py-2 text-xs text-neutral-100 outline-none hover:bg-white/[0.14] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

/** The system's own palette: first distinct colour tokens, in token order. */
export function coverColors(system) {
  const values = Object.values(system.designTokens?.colors ?? {});
  const distinct = values.filter((value, index) => typeof value === "string" && value.trim() && values.indexOf(value) === index);
  return distinct.slice(0, MAX_COVER_COLORS);
}

/** Decorative token stripe; the card name carries the accessible label. */
function Cover({ system }) {
  const colors = coverColors(system);
  return (
    <div aria-hidden="true" data-testid="design-system-cover" className="flex aspect-video w-full overflow-hidden rounded-lg bg-white/[0.08]">
      {colors.map((color) => (
        <span key={color} data-testid="design-system-cover-swatch" className="h-full min-w-0 flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

Cover.propTypes = { system: PropTypes.shape({ designTokens: PropTypes.shape({ colors: PropTypes.objectOf(PropTypes.string) }) }).isRequired };

function DesignSystemCard({ system, active, applied, onSelect }) {
  const { t } = useI18n();
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        data-testid={`design-system-item-${system.id}`}
        onClick={() => onSelect(system.id)}
        className={`${CARD_BASE} ${active ? "border-white/30 ring-1 ring-white/30" : "border-white/10"}`}
      >
        <Cover system={system} />
        <span className="min-w-0 truncate px-1 text-xs text-neutral-100">{designSystemName(system, t)}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-1 px-1 pb-1">
          {applied && <span className={BADGE_CLASS}>{t("designSystems.inUse")}</span>}
          <span className={BADGE_CLASS}>{system.builtIn ? t("designSystems.builtIn") : t("designSystems.custom")}</span>
        </span>
      </button>
    </li>
  );
}

DesignSystemCard.propTypes = {
  system: PropTypes.shape({ id: PropTypes.string.isRequired, builtIn: PropTypes.bool }).isRequired,
  active: PropTypes.bool.isRequired,
  applied: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default function DesignSystemCards({ systems, selectedId, appliedId, onSelect }) {
  const { t } = useI18n();
  const selectedIndex = systems.findIndex((system) => system.id === selectedId);
  // Start expanded when the selection would otherwise be hidden.
  const [expanded, setExpanded] = useState(selectedIndex >= COLLAPSED_COUNT);

  // A selection that moves into the hidden range (e.g. a new duplicate) must stay visible.
  useEffect(() => {
    if (selectedIndex >= COLLAPSED_COUNT) setExpanded(true);
  }, [selectedIndex]);

  const visible = expanded ? systems : systems.slice(0, COLLAPSED_COUNT);
  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={t("designSystems.listLabel")} data-testid="design-system-list" className="grid grid-cols-2 gap-2">
        {visible.map((system) => (
          <DesignSystemCard key={system.id} system={system} active={system.id === selectedId} applied={system.id === appliedId} onSelect={onSelect} />
        ))}
      </ul>
      {systems.length > COLLAPSED_COUNT && (
        <button type="button" aria-expanded={expanded} data-testid="design-system-more" onClick={() => setExpanded(!expanded)} className={MORE_CLASS}>
          {t(expanded ? "designSystems.showLess" : "designSystems.showMore")}
        </button>
      )}
    </div>
  );
}

DesignSystemCards.propTypes = {
  systems: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, builtIn: PropTypes.bool })).isRequired,
  selectedId: PropTypes.string.isRequired,
  appliedId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
};
