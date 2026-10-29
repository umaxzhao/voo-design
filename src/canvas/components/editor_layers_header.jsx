import { IconSearch, IconSwap, IconChevronDown } from "../icons.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
export default function EditorLayersHeader({
  model
}) {
  const {
    t,
    panelTab,
    setPanelTab,
    setShowSearch,
    searchInputRef,
    setSearch,
    showSearch,
    search,
    onToggleSide,
    onMobileToggleExpanded,
    mobileExpanded,
    listRef
  } = model;
  const panelTabs = [{
    key: "layers",
    label: t("editor.layers")
  }, {
    key: "assets",
    label: t("editor.assets")
  }];
  const activePanelTab = Math.max(0, panelTabs.findIndex(tab => tab.key === panelTab));
  const panelHeader = <div
    className="flex items-center justify-between gap-2 px-1 pb-1.5 pt-1 mb-2"
  >
    <div
      role="tablist"
      aria-label={t("editor.props.panelTabs")}
      data-testid="editor-layers-tabs"
      className="relative flex min-w-0 flex-1 items-center rounded-xl bg-white/[0.04] p-0.5"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 rounded-lg bg-white/[0.12] transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 4px) / ${panelTabs.length})`,
          transform: `translateX(${activePanelTab * 100}%)`
        }}
      />
      {panelTabs.map(tab => <button
        key={tab.key}
        type="button"
        role="tab"
        aria-selected={panelTab === tab.key}
        data-testid={`editor-layers-tab-${tab.key}`}
        onClick={() => setPanelTab(tab.key)}
        className={`relative z-10 flex h-7 flex-1 items-center justify-center rounded-lg text-[10px] font-mono transition-colors ${panelTab === tab.key ? "text-white" : "text-neutral-400 hover:text-neutral-200"}`}
      >
        {tab.label}
      </button>)}
    </div>
    <div
      className="editor-layers-header-actions -my-1 flex shrink-0 items-center gap-1"
    >
      <button
        type="button"
        onClick={() => {
          setShowSearch(prev => {
            const next = !prev;
            if (next) {
              setTimeout(() => searchInputRef.current?.focus(), 50);
            } else {
              setSearch("");
            }
            return next;
          });
        }}
        aria-label={t("editor.layers.searchToggle")}
        title={t("editor.layers.searchToggle")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${showSearch || search ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-800 hover:text-white"}`}
      >
        <IconSearch
          size={13}
        />
      </button>
      {onToggleSide ? <button
        type="button"
        onClick={onToggleSide}
        aria-label={t("editor.pages.toggleAxis")}
        title={t("editor.pages.toggleAxis")}
        className="editor-panel-side-swap flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        <IconSwap
          size={13}
        />
      </button> : null}
    </div>
    {onMobileToggleExpanded ? <button
      type="button"
      className="editor-mobile-panel-toggle hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10"
      aria-expanded={mobileExpanded}
      aria-label={t(mobileExpanded ? "editor.mobile.panels.collapseLayers" : "editor.mobile.panels.expandLayers")}
      title={t(mobileExpanded ? "editor.mobile.panels.collapseLayers" : "editor.mobile.panels.expandLayers")}
      onClick={onMobileToggleExpanded}
    >
      <IconChevronDown
        size={16}
        className={mobileExpanded ? "" : "rotate-180"}
      />
    </button> : null}
  </div>;
  const searchField = showSearch ? <input
    ref={searchInputRef}
    type="text"
    value={search}
    onChange={event => setSearch(event.target.value)}
    onKeyDown={event => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (search) {
          setSearch("");
        } else {
          setShowSearch(false);
          listRef.current?.focus?.();
        }
      } else if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        listRef.current?.focus?.();
      }
    }}
    placeholder={t("editor.layers.search")}
    aria-label={t("editor.layers.search")}
    className="mb-2 w-full rounded-xl border border-transparent bg-neutral-900 px-2.5 py-1.5 text-[11px] font-mono text-neutral-200 placeholder:text-neutral-400 outline-none transition-colors hover:bg-neutral-800 focus:border-[#a7ffd4]/40"
  /> : null;
  return <>{panelHeader}{searchField}</>;
}
if (import.meta.env.DEV) {
EditorLayersHeader.propTypes = {
  model: layerPanelModelType.isRequired
};
}
