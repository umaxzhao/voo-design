import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import { designSystemName } from "../editor/design_system_registry.js";

const ITEM_BASE =
  "flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40";
const BADGE_CLASS = "shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[10px] text-neutral-400";

export default function DesignSystemList({ systems, selectedId, appliedId, onSelect }) {
  const { t } = useI18n();
  return (
    <ul aria-label={t("designSystems.listLabel")} data-testid="design-system-list" className="flex flex-col gap-1">
      {systems.map((system) => {
        const active = system.id === selectedId;
        return (
          <li key={system.id}>
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              data-testid={`design-system-item-${system.id}`}
              onClick={() => onSelect(system.id)}
              className={`${ITEM_BASE} ${active ? "bg-white/[0.08] text-neutral-100" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"}`}
            >
              <span className="min-w-0 truncate">{designSystemName(system, t)}</span>
              <span className="flex shrink-0 items-center gap-2">
                {system.id === appliedId && <span className={BADGE_CLASS}>{t("designSystems.inUse")}</span>}
                <span className={BADGE_CLASS}>
                  {system.builtIn ? t("designSystems.builtIn") : t("designSystems.custom")}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

DesignSystemList.propTypes = {
  systems: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, builtIn: PropTypes.bool })).isRequired,
  selectedId: PropTypes.string.isRequired,
  appliedId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
};
