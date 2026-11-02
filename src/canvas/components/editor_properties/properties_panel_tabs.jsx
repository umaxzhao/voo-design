import PropTypes from "prop-types";
import { IconChevronDown, IconSwap } from "../../icons.jsx";

/** Keep every tab inside its share of the row, leaving the mobile toggle reachable. */
export default function PropertiesPanelTabs({
  canPrototype,
  canInspect,
  value,
  onChange,
  onToggleSide,
  mobileExpanded,
  onMobileToggleExpanded,
  t,
}) {
  const tabs = [
    ...(canPrototype ? [
      { key: "design", label: t("editor.panel.design"), view: "properties" },
      { key: "prototype", label: t("editor.props.prototype"), view: "prototype" },
    ] : canInspect ? [{ key: "design", label: t("editor.panel.design"), view: "properties" }] : []),
    ...(canInspect ? [{ key: "code", label: t("editor.inspect.code"), view: "code" }] : []),
  ];
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.view === value));
  return (
    <div className="flex shrink-0 items-stretch overflow-hidden rounded-2xl">
      <div
        role="tablist"
        aria-label={t("editor.props.panelTabs")}
        data-testid="editor-panel-tabs"
        className="relative flex min-w-0 flex-1 items-center rounded-2xl bg-white/[0.04] p-1"
      >
        {tabs.length ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-xl bg-white/[0.12] transition-transform duration-200 ease-out"
            style={{
              width: `calc((100% - 8px) / ${tabs.length})`,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
        ) : null}
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-label={tab.label}
            title={tab.label}
            aria-selected={value === tab.view}
            data-testid={`editor-panel-tab-${tab.key}`}
            onClick={() => onChange(tab.view)}
            className={`relative z-10 flex h-8 min-w-0 flex-1 items-center justify-center rounded-xl px-1 text-[10px] font-mono transition-colors ${value === tab.view ? "text-white" : "text-neutral-400 hover:text-neutral-200"}`}
          >
            <span className="min-w-0 truncate">{tab.label}</span>
          </button>
        ))}
      </div>
      {onToggleSide ? (
        <button
          type="button"
          onClick={onToggleSide}
          title={t("editor.pages.toggleAxis")}
          aria-label={t("editor.pages.toggleAxis")}
          className="editor-panel-side-swap flex w-10 shrink-0 items-center justify-center text-neutral-400 transition-colors hover:text-white"
        >
          <IconSwap size={13} />
        </button>
      ) : null}
      {onMobileToggleExpanded ? (
        <button
          type="button"
          className="editor-mobile-panel-toggle hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10"
          aria-expanded={mobileExpanded}
          aria-label={t(mobileExpanded ? "editor.mobile.panels.collapseProperties" : "editor.mobile.panels.expandProperties")}
          title={t(mobileExpanded ? "editor.mobile.panels.collapseProperties" : "editor.mobile.panels.expandProperties")}
          onClick={onMobileToggleExpanded}
        >
          <IconChevronDown size={16} className={mobileExpanded ? "" : "rotate-180"} />
        </button>
      ) : null}
    </div>
  );
}

PropertiesPanelTabs.propTypes = {
  canPrototype: PropTypes.bool,
  canInspect: PropTypes.bool,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onToggleSide: PropTypes.func,
  mobileExpanded: PropTypes.bool,
  onMobileToggleExpanded: PropTypes.func,
  t: PropTypes.func.isRequired,
};
