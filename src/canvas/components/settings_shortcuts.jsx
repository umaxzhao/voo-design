import PropTypes from "prop-types";
import { useMemo, useState } from "react";
import { DESIGN_SHORTCUT_GROUPS } from "../../shared/editor-shortcut-catalog.js";
import { IconClose, IconSearch, ICON_STROKE_WIDTH } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import SettingsSection from "./settings_section.jsx";

function Kbd({ children }) {
  return (
    <kbd className="min-w-5 rounded-md border border-white/10 bg-white/[0.08] px-1.5 py-0.5 text-center font-mono text-[10px] font-medium text-neutral-200">
      {children}
    </kbd>
  );
}

Kbd.propTypes = {
  children: PropTypes.node.isRequired,
};

// Augmented design shortcuts including boolean ops and vector paths
const ENRICHED_DESIGN_GROUPS = [
  ...DESIGN_SHORTCUT_GROUPS,
  {
    id: "vector-boolean",
    titleKey: "settings.shortcuts.booleanTitle",
    shortcuts: [
      { key: "⌥⌘U", labelKey: "settings.shortcuts.union" },
      { key: "⌥⌘S", labelKey: "settings.shortcuts.subtract" },
      { key: "⌥⌘I", labelKey: "settings.shortcuts.intersect" },
      { key: "⌥⌘X", labelKey: "settings.shortcuts.exclude" },
      { key: "⇧⌥⌘O", labelKey: "settings.shortcuts.expandStroke" },
      { key: "⇧⌘;'", labelKey: "settings.shortcuts.toggleSnapping" },
    ],
  },
];

export default function SettingsShortcuts({ asSection = true }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return ENRICHED_DESIGN_GROUPS;

    return ENRICHED_DESIGN_GROUPS.map((group) => {
      const matchingShortcuts = (group.shortcuts ?? []).filter((item) => {
        const localizedLabel = t(item.labelKey);
        if (localizedLabel.toLowerCase().includes(trimmed)) return true;
        if (item.key && item.key.toLowerCase().includes(trimmed)) return true;
        return false;
      });
      return {
        ...group,
        shortcuts: matchingShortcuts,
      };
    }).filter((group) => group.shortcuts.length > 0);
    // The translator is stable across locale changes; filtered labels are not.
  }, [query, t, locale]);

  const content = (
    <div className="flex flex-col gap-4" data-testid="settings-shortcuts">
      {/* Search Input */}
      <div className="relative flex items-center">
        <IconSearch
          size={14}
          strokeWidth={ICON_STROKE_WIDTH}
          className="pointer-events-none absolute left-3 text-neutral-500"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("settings.shortcuts.search")}
          aria-label={t("editor.shortcuts.title")}
          className="h-8 w-full rounded-xl bg-white/[0.06] pl-8 pr-8 text-xs text-neutral-200 placeholder-neutral-400 outline-none transition-all focus:bg-white/[0.1] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("settings.shortcuts.clear")}
            title={t("settings.shortcuts.clear")}
            className="absolute right-2 flex size-5 items-center justify-center rounded-full text-neutral-400 hover:text-white"
          >
            <IconClose size={12} strokeWidth={ICON_STROKE_WIDTH} />
          </button>
        ) : null}
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-5">
        {filteredGroups.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500">
            {t("settings.shortcuts.noMatching")}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const groupTitle = t(group.titleKey);

            return (
              <div key={group.id} className="flex flex-col gap-2">
                <h4 className="text-[11px] font-medium tracking-wider text-neutral-400 uppercase">
                  {groupTitle}
                </h4>
                <div className="divide-y divide-white/[0.06]">
                  {group.shortcuts.map((item) => {
                    const label = t(item.labelKey);

                    return (
                      <div
                        key={`${item.labelKey}:${item.key}`}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <span className="text-neutral-300 font-normal">{label}</span>
                        <div className="flex items-center gap-1">
                          {item.key.split(" / ").map((kPart, i, arr) => (
                            <span key={kPart} className="flex items-center gap-1">
                              <Kbd>{kPart}</Kbd>
                              {i < arr.length - 1 && (
                                <span className="text-[10px] text-neutral-500">/</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (!asSection) return content;

  return (
    <SettingsSection
      title={t("settings.shortcuts.title")}
      hint={t("settings.shortcuts.description")}
    >
      {content}
    </SettingsSection>
  );
}

SettingsShortcuts.propTypes = {
  asSection: PropTypes.bool,
};
