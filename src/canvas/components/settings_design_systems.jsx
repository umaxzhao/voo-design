import { useEffect, useReducer, useState } from "react";
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
import DesignSystemList from "./design_system_list.jsx";
import DesignTokenFields from "./design_token_fields.jsx";
import { editorReducer, initialEditorState } from "./design_system_editor_state.js";
import SettingsSection from "./settings_section.jsx";
import { useCustomDesignSystems } from "./use_custom_design_systems.js";

/** Registry errors carry a code; anything else (token validation) already has a message. */
function errorText(error, t) {
  return error.code ? t(`designSystems.error.${error.code}`) : error.message;
}

export default function SettingsDesignSystems() {
  const { t, locale } = useI18n();
  const pageId = useDesignStore((s) => s.editingNodeId);
  const [custom, commit] = useCustomDesignSystems();
  const systems = listDesignSystems(custom);
  const [appliedId, setAppliedId] = useState(null);
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState("");
  const [state, dispatch] = useReducer(editorReducer, systems[0], initialEditorState);
  const selected = systems.find((system) => system.id === state.selectedId) ?? systems[0];
  const selectedName = designSystemName(selected, t);

  // The applied id lives on the document, so re-read it when the page changes.
  useEffect(() => {
    const editor = window.__vooEditor;
    const doc = editor?.getDocument?.();
    setAvailable(Boolean(doc && editor?.setDesignSystem));
    const id = doc?.designSystemId ?? null;
    setAppliedId(id);
    setStatus("");
    const current = listDesignSystems(custom).find((system) => system.id === id);
    if (current) dispatch({ type: "select", system: current });
    // Only the page change re-syncs; later registry edits are driven by handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // The selected custom system was removed elsewhere: fall back to the first preset.
  useEffect(() => {
    if (selected.id !== state.selectedId) dispatch({ type: "select", system: selected });
  }, [selected, state.selectedId]);

  // A pristine built-in draft carries a locale-specific brief: refresh it on locale change.
  useEffect(() => {
    if (selected.builtIn && !state.dirty) dispatch({ type: "select", system: selected });
    // Only the locale change re-reads the preset; edits must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

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
    applyDesignSystemToDocument(window.__vooEditor, selected);
    setAppliedId(selected.id);
    setStatus(t("designSystems.applied", { name: selectedName }));
  });

  const missingApplied = appliedId && !systems.some((system) => system.id === appliedId);

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection title={t("designSystems.listTitle")} hint={t("designSystems.listHint")}>
        {!available && <p className="text-xs text-neutral-400">{t("designSystems.noDocument")}</p>}
        {missingApplied && <p className="text-xs text-neutral-400">{t("designSystems.appliedMissing")}</p>}
        <DesignSystemList systems={systems} selectedId={selected.id} appliedId={appliedId} onSelect={select} />
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
        {state.dirty && <p className="text-xs text-neutral-500">{t("designSystems.saveFirst")}</p>}
      </SettingsSection>
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
    </div>
  );
}
