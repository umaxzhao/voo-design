import PropTypes from "prop-types";

/** Same tile look as the AI Providers tabs: selected is a brighter fill, never a new colour. */
const TILE_BASE =
  "w-full min-w-0 rounded-xl text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";
const TILE_SELECTED = "bg-white/[0.12] text-neutral-100 font-medium";
const TILE_IDLE = "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200";
const DEFAULT_TILE_LAYOUT = "flex min-h-10 items-center gap-2.5 px-2.5 py-2";
const DEFAULT_COLUMNS = "grid-cols-1 sm:grid-cols-3";

export const tabDomId = (idPrefix, id) => `${idPrefix}-tab-${id}`;
export const panelDomId = (idPrefix) => `${idPrefix}-panel`;

/** Arrow keys move between tabs; Home and End jump to the ends. Returns null for any other key. */
export function nextTabIndex(key, index, count) {
  if (count === 0) return null;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * Shared tab row for settings pages. Roving tabindex: only the selected tab is in the
 * tab order; ArrowLeft and ArrowRight select and focus the neighbouring tab.
 * `tabs` is [{ id, label, testId, content? }]; `content` replaces the plain label.
 */
export default function SettingsTabStrip({
  tabs,
  selectedId,
  onSelect,
  label,
  idPrefix,
  columnsClass = DEFAULT_COLUMNS,
  tileLayoutClass = DEFAULT_TILE_LAYOUT,
}) {
  const handleKeyDown = (event) => {
    const index = tabs.findIndex((tab) => tab.id === selectedId);
    const target = nextTabIndex(event.key, Math.max(index, 0), tabs.length);
    if (target === null) return;
    event.preventDefault();
    const next = tabs[target];
    onSelect(next.id);
    // The tabs are siblings inside the tablist, so focus follows selection without refs.
    event.currentTarget.querySelectorAll('[role="tab"]')[target]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={`grid gap-2 w-full ${columnsClass}`}
    >
      {tabs.map((tab) => {
        const isSelected = tab.id === selectedId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabDomId(idPrefix, tab.id)}
            aria-selected={isSelected}
            aria-controls={isSelected ? panelDomId(idPrefix) : undefined}
            tabIndex={isSelected ? 0 : -1}
            data-testid={tab.testId}
            onClick={() => onSelect(tab.id)}
            className={`${TILE_BASE} ${tileLayoutClass} ${isSelected ? TILE_SELECTED : TILE_IDLE}`}
          >
            {tab.content ?? <span className="truncate text-[11px]">{tab.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

SettingsTabStrip.propTypes = {
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string,
      testId: PropTypes.string,
      content: PropTypes.node,
    }),
  ).isRequired,
  selectedId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  idPrefix: PropTypes.string.isRequired,
  columnsClass: PropTypes.string,
  tileLayoutClass: PropTypes.string,
};

/** The single panel under the strip; only the selected tab's content is ever mounted inside it. */
export function SettingsTabPanel({ idPrefix, selectedId, testId, children }) {
  return (
    <div
      role="tabpanel"
      id={panelDomId(idPrefix)}
      aria-labelledby={tabDomId(idPrefix, selectedId)}
      data-testid={testId}
      className="flex flex-col gap-3"
    >
      {children}
    </div>
  );
}

SettingsTabPanel.propTypes = {
  idPrefix: PropTypes.string.isRequired,
  selectedId: PropTypes.string.isRequired,
  testId: PropTypes.string,
  children: PropTypes.node,
};
