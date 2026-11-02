import "./editor_resources.css";
import { useEffect, useRef, useState } from "react";
import { FolderOpen, Plus, BookmarkPlus, Trash2, Layers } from "lucide-react";
import CustomSelect from "./custom_select.jsx";
import { layerPanelModelType } from "./editor_layers_contract.js";
import { useI18n } from "../use_i18n.js";
import { workspaceStorage } from "../../services/workspace_storage.js";

/** One resource browser shared by file components, workspace assets and templates. */
export default function EditorLayersAssets({ model }) {
  const { t } = useI18n();
  const { assetEngine: engine, canvasPages = [], resolveCanvas, query = "", selectedIds = [], assetNodes = [] } = model;
  const [source, setSource] = useState("workspace");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const picker = useRef(null);
  const live = useRef(engine);
  live.current = engine;
  useEffect(() => { live.current = engine; return () => { live.current = null; }; }, [engine]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const unsubscribe = workspaceStorage.subscribe(refresh);
    window.addEventListener("voo:workspace-changed", refresh);
    return () => { unsubscribe(); window.removeEventListener("voo:workspace-changed", refresh); };
  }, []);
  const localComponents = engine?.getDocument?.()?.components ?? {};
  const componentPages = [...canvasPages.filter(page => page.isComponent && page.id !== model.activeCanvasId),
    ...Object.entries(localComponents).filter(([id]) => !canvasPages.some(page => page.id === id)).map(([id, document]) => ({
      id, document, title: engine.getDocument().nodes.find(node => node.sourceCanvasId === id)?.name || document.name || id,
    }))];
  const catalogKey = JSON.stringify([componentPages.map(page => [page.id, page.title]), assetNodes.map(({ node, preview }) => [node.id, node.name, node.imageId, preview?.length])]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      if (source === "current") {
        const { resourcePreview } = await import("../resources/resource_catalog.js");
        return [
        ...componentPages.map(page => ({ id: page.id, name: page.title, page, preview: resourcePreview(page.document || resolveCanvas?.(page.id)) })),
        ...assetNodes.map(({ node, preview }) => ({ id: node.id, name: node.name || node.kind, node, preview })),
      ];
      }
      if (source === "templates") return (await import("../resources/resource_catalog.js")).templateResources();
      const { listWorkspaceResources } = await import("../resources/workspace_resources.js");
      return listWorkspaceResources();
    };
    load().then(result => { if (!cancelled) setItems(result); })
      .catch(() => { if (!cancelled) { setItems([]); setError(t("editor.assets.loadFailed")); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source, revision, catalogKey, model.activeCanvasId, t]);

  const run = async action => {
    if (busy || !engine) return;
    const target = engine;
    const canvasId = target.getDocument()?.canvasId;
    const driver = workspaceStorage.getDriver();
    const assertTarget = () => {
      if (live.current !== target || target.getDocument()?.canvasId !== canvasId || workspaceStorage.getDriver() !== driver) throw new Error("resource-target-changed");
    };
    setBusy(true); setError("");
    try { await action(target, assertTarget); }
    catch (failure) { if (live.current) setError(t(failure.message === "resource-too-large" ? "editor.assets.tooLarge" : "editor.assets.failed")); }
    finally { if (live.current) setBusy(false); }
  };
  const insertionPoint = target => {
    const roots = target.getDocument().nodes.filter(node => !node.parentId);
    return { x: roots.length ? Math.max(...roots.map(node => (node.x ?? 0) + (node.width ?? 0))) + 80 : 0, y: 0 };
  };
  const insert = item => run(async (target, assertTarget) => {
    const { insertResourceNodes, insertComponentResource, selectionResource } = await import("../resources/resource_nodes.js");
    const point = insertionPoint(target);
    if (item.page) { assertTarget(); return insertComponentResource(target, item.page, item.page.document || resolveCanvas(item.page.id), point, { resolveCanvas, targetId: model.activeCanvasId }); }
    if (item.node) { assertTarget(); return insertResourceNodes(target, selectionResource(target.getDocument(), [item.node.id]), point, item.name); }
    let file;
    if (item.document) file = { document: item.document, assets: {} };
    else file = await (await import("../resources/workspace_resources.js")).readWorkspaceResource(item);
    const { hydrateVooImages } = await import("../store/project_io.js");
    assertTarget();
    await hydrateVooImages(file);
    assertTarget();
    insertResourceNodes(target, file.document, point, item.name.replace(/\.voo$/i, ""));
  });
  const saveSelection = () => run(async (target, assertTarget) => {
    const { selectionResource } = await import("../resources/resource_nodes.js");
    const { packageResource, saveWorkspaceResource } = await import("../resources/workspace_resources.js");
    const { expandInstancesForRaster } = await import("../editor/editor_export_instances.js");
    const { flushEditorPendingWrites } = await import("./editor_hooks/editor-autosave.js");
    await flushEditorPendingWrites(target, { commitSelection: true });
    assertTarget();
    const ids = target.getSelectedGroup?.()?.id ? [target.getSelectedGroup().id] : selectedIds;
    const doc = expandInstancesForRaster(selectionResource(target.getDocument(), ids), id => resolveCanvas?.(id) || target.getDocument().components?.[id]);
    const preview = await (target.exportSelectionPngAsync ?? target.exportSelectionPng)?.(ids);
    const file = await packageResource(doc, preview?.dataUrl);
    assertTarget();
    await saveWorkspaceResource(file, doc.nodes.find(node => !node.parentId)?.name || "Resource");
    if (live.current) { setSource("workspace"); setRevision(value => value + 1); }
  });
  const visible = items.filter(item => `${item.name} ${item.category ?? ""}`.toLowerCase().includes(query));
  return <div data-testid="editor-resource-browser" className="flex min-h-0 flex-1 flex-col gap-2">
    <div className="editor-resource-toolbar flex min-w-0 items-center gap-1">
      <CustomSelect aria-label={t("editor.assets.source")} value={source} onChange={event => { setSource(event.target.value); setError(""); }} rootClassName="min-w-0 flex-1" className="w-full rounded-lg bg-neutral-900 px-2 py-2 text-[11px]">
        {["workspace", "current", "templates"].map(key => <option key={key} value={key}>{t(`editor.assets.${key}`)}</option>)}
      </CustomSelect>
      <button type="button" aria-label={t("editor.assets.import")} title={t("editor.assets.import")} disabled={busy} onClick={() => picker.current?.click()} className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 disabled:opacity-40"><Plus size={14} strokeWidth={1.5} /></button>
      <button type="button" aria-label={t("editor.assets.saveSelection")} title={t("editor.assets.saveSelection")} disabled={busy || !selectedIds.length} onClick={saveSelection} className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 disabled:opacity-40"><BookmarkPlus size={14} strokeWidth={1.5} /></button>
    </div>
    <input ref={picker} type="file" multiple accept=".voo,.svg,.png,.jpg,.jpeg,.webp" className="hidden" aria-label={t("editor.assets.import")} onChange={event => {
      const files = [...event.target.files]; event.target.value = "";
      void run(async (_target, assertTarget) => {
        const { importResourceFile } = await import("../resources/workspace_resources.js");
        assertTarget();
        for (const file of files) { await importResourceFile(file); assertTarget(); }
        if (live.current) { setSource("workspace"); setRevision(value => value + 1); }
      });
    }} />
    {error && <p role="alert" className="text-[11px] text-rose-400">{error}</p>}
    {loading || busy ? <p role="status" className="py-3 text-[11px] text-neutral-400">{t("editor.assets.loading")}</p> : null}
    <div className="ui-scroll min-h-0 flex-1 overflow-y-auto" aria-busy={loading || busy}>
      {!loading && !visible.length ? <div className="flex flex-col items-center gap-2 px-2 py-5 text-center text-[11px] text-neutral-400"><FolderOpen size={24} strokeWidth={1.5} />{t(query ? "editor.assets.noResults" : "editor.assets.emptyLibrary")}</div> : null}
      <div className="editor-resource-grid grid grid-cols-2 gap-2">
        {visible.map(item => <div key={item.id} className="group relative min-w-0">
          <button type="button" data-resource-id={item.id} disabled={busy} onClick={() => insert(item)} aria-label={`${t("editor.assets.insert")}: ${item.name}`} className="w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.04] p-1.5 text-left hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-mint disabled:opacity-40">
            <span className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-neutral-900">{item.preview ? <img src={item.preview} alt="" className="size-full object-contain" /> : <Layers size={24} strokeWidth={1.5} />}</span>
            <span className="mt-1 block truncate text-[10px] text-neutral-300" title={item.name}>{item.name.replace(/-[a-f0-9]{8}\.voo$/i, "").replace(/\.voo$/i, "")}</span>
          </button>
          {source === "workspace" && <button data-resource-remove type="button" aria-label={`${t("editor.assets.remove")}: ${item.name}`} disabled={busy} onClick={() => run(async () => {
            const result = await workspaceStorage.moveToTrash(item.path || item.id);
            if (!result.ok) throw new Error("resource-delete-failed");
          })} className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg bg-neutral-900 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"><Trash2 size={12} strokeWidth={1.5} /></button>}
        </div>)}
      </div>
    </div>
    <p className="text-[10px] text-neutral-400">{t("editor.assets.folderHint")}</p>
  </div>;
}
if (import.meta.env.DEV) {
  EditorLayersAssets.propTypes = { model: layerPanelModelType.isRequired };
}
