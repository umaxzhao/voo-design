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
    titleKey: "editor.shortcuts.group.boolean",
    title: "Boolean & Geometry",
    titleZh: "布尔运算与几何变换",
    shortcuts: [
      { key: "⌥⌘U", label: "Union (Merge paths)", labelZh: "并集运算 (合并路径)" },
      { key: "⌥⌘S", label: "Subtract (Minus Front)", labelZh: "差集运算 (减去顶层)" },
      { key: "⌥⌘I", label: "Intersect", labelZh: "交集运算 (保留重叠)" },
      { key: "⌥⌘X", label: "Exclude (Difference)", labelZh: "排除重叠 (异或)" },
      { key: "⇧⌥⌘O", label: "Expand Stroke to Path", labelZh: "扩展描边为轮廓路径" },
      { key: "⇧⌘;'", label: "Toggle Snapping", labelZh: "开启/关闭智能吸附" },
    ],
  },
];

export default function SettingsShortcuts({ asSection = true }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const isZh = locale === "zh";

  const filteredGroups = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return ENRICHED_DESIGN_GROUPS;

    return ENRICHED_DESIGN_GROUPS.map((group) => {
      const matchingShortcuts = (group.shortcuts ?? []).filter((item) => {
        const localizedLabel = item.labelKey
          ? t(item.labelKey)
          : isZh && item.labelZh
            ? item.labelZh
            : item.label || "";
        if (localizedLabel.toLowerCase().includes(trimmed)) return true;
        if (item.key && item.key.toLowerCase().includes(trimmed)) return true;
        return false;
      });
      return {
        ...group,
        shortcuts: matchingShortcuts,
      };
    }).filter((group) => group.shortcuts.length > 0);
  }, [query, t, isZh]);

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
          placeholder={isZh ? "搜索快捷键或功能名称..." : "Search shortcuts or tools..."}
          aria-label={t("editor.shortcuts.title") || "Shortcuts"}
          className="h-8 w-full rounded-xl bg-white/[0.06] pl-8 pr-8 text-xs text-neutral-200 placeholder-neutral-400 outline-none transition-all focus:bg-white/[0.1] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear"
            title="Clear"
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
            {isZh ? "未找到相关快捷键" : "No matching shortcuts found"}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const groupTitle = group.titleKey
              ? t(group.titleKey)
              : isZh && group.titleZh
                ? group.titleZh
                : group.title || group.id;

            return (
              <div key={group.id} className="flex flex-col gap-2">
                <h4 className="text-[11px] font-medium tracking-wider text-neutral-400 uppercase">
                  {groupTitle}
                </h4>
                <div className="divide-y divide-white/[0.06]">
                  {group.shortcuts.map((item, index) => {
                    const label = item.labelKey
                      ? t(item.labelKey)
                      : isZh && item.labelZh
                        ? item.labelZh
                        : item.label || "";

                    return (
                      <div
                        key={item.key + index}
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
      title={isZh ? "快捷键参考" : "Keyboard Shortcuts"}
      description={
        isZh
          ? "浏览和查找常用设计工具与几何操作的键盘快捷键"
          : "Quickly look up design tools and vector manipulation key bindings"
      }
    >
      {content}
    </SettingsSection>
  );
}

SettingsShortcuts.propTypes = {
  asSection: PropTypes.bool,
};
