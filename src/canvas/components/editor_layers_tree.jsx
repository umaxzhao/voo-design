import { checkCanvasMatch } from "./editor_canvas_tree_model.js";
import EditorCanvasTreeRow from "./editor_canvas_tree_row.jsx";
import EditorLayerRow from "./editor_layer_row.jsx";
import EditorCanvasInactiveLayers from "./editor_canvas_inactive_layers.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
export default function EditorLayersTree({
  model
}) {
  const {
    listRef,
    t,
    listActiveDescendantDomId,
    handleListKeyDown,
    listEmpty,
    pagesToRender,
    activeCanvasId,
    collapsedCanvasIds,
    query,
    rows,
    backgroundMatches,
    labels,
    toggleCanvasCollapse,
    handleCanvasRowFocus,
    handleSelectInactiveCanvasLayer,
    collapsedGroupIdsByCanvas,
    toggleGroupCollapse,
    showBackgroundRow,
    isBackgroundSelected,
    onSelectBackground,
    backgroundTransparent,
    displayBg
  } = model;
  return <div
    ref={listRef}
    data-layers-list
    tabIndex={0}
    role="listbox"
    aria-label={t("editor.layers")}
    aria-multiselectable="true"
    aria-activedescendant={listActiveDescendantDomId}
    onKeyDown={handleListKeyDown}
    onMouseDown={() => listRef.current?.focus?.()}
    className="ui-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden space-y-1 outline-none"
  >
    {listEmpty ? <div
      className="flex min-h-[80px] items-center justify-center px-3 py-4 text-center text-[11px] font-mono text-neutral-500"
    >
      {t("editor.layers.noMatch")}
    </div> : <>
      {pagesToRender.map(page => {
        const isActive = page.id === activeCanvasId || page.isFallback;
        const isCollapsed = !page.isCanvasRoot && collapsedCanvasIds.has(page.id);
        const isExpanded = !isCollapsed;
        if (query && !page.isFallback) {
          const match = isActive ? page.title?.toLowerCase().includes(query) || rows.length > 0 || backgroundMatches : checkCanvasMatch(page, query, labels).matchesSelf || checkCanvasMatch(page, query, labels).matchingLayersCount > 0;
          if (!match) return null;
        }
        return <div
        key={page.id}
        className="flex flex-col gap-0.5"
      >
        {!page.isFallback && !page.isCanvasRoot ? <EditorCanvasTreeRow
          page={page}
          isActive={isActive}
          isCollapsed={!isExpanded}
          onToggleCollapse={toggleCanvasCollapse}
          onFocusCanvas={handleCanvasRowFocus}
          t={t}
        /> : null}
        {isExpanded || page.isFallback ? <div
          className={`flex flex-col gap-0.5 ${page.isFallback || page.isCanvasRoot ? "" : "pl-2"}`}
        >
          {isActive ? <>
            {rows.map(row => <EditorLayerRow
              key={row.node.id}
              model={model}
              row={row}
            />)}
          </> : <EditorCanvasInactiveLayers
            canvasId={page.id}
            nodes={page.nodes}
            selectedIds={page.selectedIds}
            selectedGroupId={page.selectedGroupId}
            onSelectCanvasLayer={handleSelectInactiveCanvasLayer}
            collapsedGroupIds={collapsedGroupIdsByCanvas.get(page.id) ?? new Set()}
            onToggleGroupCollapse={toggleGroupCollapse}
            labels={labels}
            query={query}
          />}
        </div> : null}
      </div>;
      })}
    </>}
    {/* Canvas background layer row at the very bottom */}
    {showBackgroundRow ? <div
      role="option"
      id="layer-row-canvas-background"
      aria-selected={isBackgroundSelected}
      tabIndex={-1}
      className={`group/layer flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all cursor-pointer ${isBackgroundSelected ? "bg-neutral-800 text-neutral-100 shadow-[inset_0_0_0_1px_#a7ffd4]" : "bg-transparent text-neutral-300 hover:bg-white/[0.08]"}`}
      style={{
        boxShadow: isBackgroundSelected ? "inset 0 0 0 1px #a7ffd4" : undefined
      }}
      onClick={onSelectBackground}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectBackground?.();
        }
      }}
    >
      <div
        className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20"
        style={{
          backgroundColor: backgroundTransparent ? "transparent" : displayBg
        }}
      />
      <span
        className="min-w-0 flex-1 truncate text-left text-[11px] font-mono font-medium text-neutral-200"
      >
        {t("editor.layer.canvasBackground")}
      </span>
      <span
        className={`text-[11px] font-mono text-neutral-400 ${backgroundTransparent ? "" : "uppercase"}`}
      >
        {displayBg}
      </span>
    </div> : null}
  </div>;
}
if (import.meta.env.DEV) {
EditorLayersTree.propTypes = {
  model: layerPanelModelType.isRequired
};
}
