import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import { designSystemName } from "../editor/design_system_registry.js";
import SettingsTabStrip from "./settings_tab_strip.jsx";

/** Cards visible before "Show more": two full rows at lg (3 columns) and two rows below lg (2 columns). */
export const COLLAPSED_COUNT = 6;
const MAX_COVER_COLORS = 6;

/** Tile layout inside the shared tab strip: cover on top, name and badges below. */
const CARD_LAYOUT = "flex flex-col gap-1.5 p-2";
/** The tab row keeps the cover-card grid: two columns, three from lg. */
const CARD_COLUMNS = "grid-cols-2 lg:grid-cols-3";
export const DESIGN_SYSTEM_TAB_PREFIX = "design-system";
const BADGE_CLASS = "shrink-0 rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-neutral-400";
const MORE_CLASS =
  "min-h-9 self-start rounded-lg bg-white/10 px-4 py-1.5 text-xs text-neutral-100 outline-none hover:bg-white/[0.14] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";

/** The system's own palette: first distinct colour tokens, in token order. */
export function coverColors(system) {
  const values = Object.values(system.designTokens?.colors ?? {});
  const distinct = values.filter((value, index) => typeof value === "string" && value.trim() && values.indexOf(value) === index);
  return distinct.slice(0, MAX_COVER_COLORS);
}

/** Decorative token stripe; the card name carries the accessible label. */
function Cover({ system }) {
  const colors = coverColors(system);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [system.id, system.coverImage]);

  return (
    <div
      aria-hidden="true"
      data-testid="design-system-cover"
      className="relative flex h-16 w-full flex-wrap content-center items-center justify-center gap-1 overflow-hidden rounded-lg bg-white/[0.08]"
    >
      {colors.map((color) => (
        <span
          key={color}
          data-testid="design-system-cover-swatch"
          className="size-6 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
      {system.coverImage && !imageFailed && (
        <img
          src={system.coverImage}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  );
}

Cover.propTypes = {
  system: PropTypes.shape({
    id: PropTypes.string.isRequired,
    coverImage: PropTypes.string,
    sourceName: PropTypes.string,
    designTokens: PropTypes.shape({ colors: PropTypes.objectOf(PropTypes.string) }),
  }).isRequired,
};

/** Cover, name and badges shown inside one design-system tab tile. */
function DesignSystemTile({ system, applied }) {
  const { t } = useI18n();
  return (
    <>
      <Cover system={system} />
      <span className="min-w-0 truncate px-1 text-xs text-neutral-100">{designSystemName(system, t)}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-1 px-1">
        {applied && <span className={BADGE_CLASS}>{t("designSystems.inUse")}</span>}
        <span className={BADGE_CLASS}>{system.builtIn ? t("designSystems.builtIn") : t("designSystems.custom")}</span>
      </span>
    </>
  );
}

DesignSystemTile.propTypes = {
  system: PropTypes.shape({ id: PropTypes.string.isRequired, builtIn: PropTypes.bool }).isRequired,
  applied: PropTypes.bool.isRequired,
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
  const tabs = visible.map((system) => ({
    id: system.id,
    label: designSystemName(system, t),
    testId: `design-system-item-${system.id}`,
    content: <DesignSystemTile system={system} applied={system.id === appliedId} />,
  }));
  return (
    <div className="flex flex-col gap-2" data-testid="design-system-list">
      <SettingsTabStrip
        tabs={tabs}
        selectedId={selectedId}
        onSelect={onSelect}
        label={t("designSystems.listLabel")}
        idPrefix={DESIGN_SYSTEM_TAB_PREFIX}
        columnsClass={CARD_COLUMNS}
        tileLayoutClass={CARD_LAYOUT}
      />
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
