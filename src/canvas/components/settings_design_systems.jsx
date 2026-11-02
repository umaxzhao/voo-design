import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useDesignStore } from "../../store/design_store.js";
import { useI18n } from "../use_i18n.js";
import {
  applyDesignSystemToDocument,
  deleteDesignSystem,
  designSystemName,
  duplicateDesignSystem,
  listDesignSystems,
  renameDesignSystem,
  saveDesignSystemEdits,
} from "../editor/design_system_registry.js";
import { updateTokenPath } from "./design_token_controls.js";
import DesignSystemActions, { ACTION_CLASS } from "./design_system_actions.jsx";
import DesignSystemCards, { DESIGN_SYSTEM_TAB_PREFIX } from "./design_system_cards.jsx";
import { SettingsTabPanel } from "./settings_tab_strip.jsx";
import DesignTokenFields from "./design_token_fields.jsx";
import { editorReducer, initialEditorState } from "./design_system_editor_state.js";
import SettingsSection from "./settings_section.jsx";
import { useCustomDesignSystems } from "./use_custom_design_systems.js";
import { EDITOR_ENGINE_CHANGE_EVENT, isEditorEngineReady } from "../editor-engine-events.js";

/** Registry errors carry a code; anything else (token validation) already has a message. */
function errorText(error, t) {
  return error.code ? t(`designSystems.error.${error.code}`) : error.message;
}

export default function SettingsDesignSystems() {
  const { t, locale } = useI18n();
  const pageId = useDesignStore((s) => s.editingNodeId);
  const [custom, commit] = useCustomDesignSystems();
  const systems = useMemo(() => listDesignSystems(custom), [custom]);
  const [appliedId, setAppliedId] = useState(null);
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState("");
  const [state, dispatch] = useReducer(editorReducer, systems[0], initialEditorState);
  const selected = systems.find((system) => system.id === state.selectedId) ?? systems[0];
  const selectedName = designSystemName(selected, t);
  const pageEditorRef = useRef(null);
  const syncedPageRef = useRef(null);

  // Engines may finish opening after the page changes. Follow their ready
  // notification, but only reset the draft when its actual page/engine changes.
  useEffect(() => {
    const sync = (event) => {
      if (event?.detail?.nodeId && event.detail.nodeId !== pageId) return;
      const candidate = window.__vooEditors?.[pageId];
      const editor = isEditorEngineReady(candidate) ? candidate : null;
      pageEditorRef.current = editor;
      const doc = editor?.getDocument?.();
      setAvailable(Boolean(doc && editor?.setDesignSystem));
      const id = doc?.designSystemId ?? null;
      setAppliedId(id);
      const previous = syncedPageRef.current;
      if (previous?.pageId === pageId && previous.editor === editor) return;
      syncedPageRef.current = { pageId, editor };
      setStatus("");
      const current = systems.find((system) => system.id === id);
      if (current) dispatch({ type: "select", system: current });
    };
    sync();
    window.addEventListener(EDITOR_ENGINE_CHANGE_EVENT, sync);
    return () => window.removeEventListener(EDITOR_ENGINE_CHANGE_EVENT, sync);
  }, [pageId, systems]);

  // The selected custom system was removed elsewhere: fall back to the first preset.
  useEffect(() => {
    if (selected.id !== state.selectedId) dispatch({ type: "select", system: selected });
  }, [selected, state.selectedId]);

  // A pristine built-in draft carries a locale-specific brief: refresh it on locale change.
  useEffect(() => {
    if (selected.builtIn && !state.dirty) dispatch({ type: "select", system: selected });
  }, [locale, selected, state.dirty]);

  async function run(action) {
    try {
      await action();
    } catch (error) {
      setStatus(errorText(error, t));
    }
  }

  const select = (id) => {
    dispatch({ type: "select", system: systems.find((system) => system.id === id) });
    setStatus("");
  };

  const save = () => run(async () => {
    const copyName = t("designSystems.copyName", { name: selectedName });
    const { list, system } = saveDesignSystemEdits(custom, selected, { designTokens: state.tokens, designMd: state.designMd }, copyName);
    await commit(list);
    dispatch({ type: "saved", system });
    const stale = !selected.builtIn && appliedId === selected.id;
    setStatus(selected.builtIn ? t("designSystems.savedCopy", { name: system.name }) : t(stale ? "designSystems.savedNotApplied" : "designSystems.saved"));
  });

  const duplicate = () => run(async () => {
    const { list, system } = duplicateDesignSystem(custom, selected, t("designSystems.copyName", { name: selectedName }));
    await commit(list);
    dispatch({ type: "select", system });
    setStatus(t("designSystems.duplicated", { name: system.name }));
  });

  const rename = (name) => run(async () => {
    const { list } = renameDesignSystem(custom, selected.id, name);
    await commit(list);
    dispatch({ type: "rename", value: false });
    setStatus(t("designSystems.renamed"));
  });

  const remove = () => run(async () => {
    await commit(deleteDesignSystem(custom, selected.id));
    dispatch({ type: "select", system: systems[0] });
    setStatus(t("designSystems.deleted"));
  });

  const use = () => run(async () => {
    applyDesignSystemToDocument(pageEditorRef.current, selected);
    setAppliedId(selected.id);
    setStatus(t("designSystems.applied", { name: selectedName }));
  });

  const missingApplied = appliedId && !systems.some((system) => system.id === appliedId);

  return (
    <div className="flex flex-col gap-3">
      <DesignSystemCards systems={systems} selectedId={selected.id} appliedId={appliedId} onSelect={select} />
      {!available && <p className="text-xs text-neutral-400">{t("designSystems.noDocument")}</p>}
      {missingApplied && <p className="text-xs text-neutral-400">{t("designSystems.appliedMissing")}</p>}
      {/* Only the selected system's content renders under the tab row. */}
      <SettingsTabPanel idPrefix={DESIGN_SYSTEM_TAB_PREFIX} selectedId={selected.id} testId="design-system-panel">
        <DesignSystemActions
          system={selected}
          name={selectedName}
          canUse={available && !state.dirty}
          renaming={state.renaming}
          confirmingDelete={state.confirmingDelete}
          onUse={use}
          onDuplicate={duplicate}
          onRenameToggle={(value) => dispatch({ type: "rename", value })}
          onRename={rename}
          onDeleteToggle={(value) => dispatch({ type: "confirmDelete", value })}
          onDelete={remove}
        />
        {selected.sourceUrl && (
          <p className="text-xs text-neutral-500">
            <a
              href={selected.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/20 underline-offset-2 hover:text-neutral-300"
            >
              {t("designSystems.reference", { source: selected.sourceName })}
            </a>
          </p>
        )}
        {state.dirty && <p className="text-xs text-neutral-500">{t("designSystems.saveFirst")}</p>}
        <SettingsSection title={`${t("designSystems.editorTitle")} · ${selectedName}`} hint={t("designSystems.editorHint")}>
          {selected.builtIn && <p className="text-xs text-neutral-400">{t("designSystems.builtInNotice")}</p>}
          <DesignTokenFields
            tokens={state.tokens}
            designMd={state.designMd}
            onTokenChange={(path, value) => {
              dispatch({ type: "tokens", tokens: updateTokenPath(state.tokens, path, value) });
              setStatus(t("designSystems.unsaved"));
            }}
            onMarkdownChange={(designMd) => {
              dispatch({ type: "markdown", designMd });
              setStatus(t("designSystems.unsaved"));
            }}
          />
          <button type="button" disabled={!state.dirty} onClick={save} className={ACTION_CLASS}>
            {selected.builtIn ? t("designSystems.saveAsCopy") : t("designSystems.save")}
          </button>
          <p role="status" className="text-xs text-neutral-400">{status}</p>
        </SettingsSection>
      </SettingsTabPanel>
    </div>
  );
}
