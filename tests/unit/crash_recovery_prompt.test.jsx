import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrashRecoveryDialog, resolveCrashRecovery } from "../../src/canvas/components/crash_recovery_prompt.jsx";
import { saveCrashDraft, loadCrashDraft, clearCrashDraft, loadLatestCrashDraft } from "../../src/shared/crash_recovery.js";
import { useDesignStore } from "../../src/store/design_store.js";
import { loadLocale } from "../../src/shared/i18n.js";

const draft = { id: "recovery-test", label: "Recovered.voo", document: { width: 540, height: 360, nodes: [{ id: "restored-shape" }] } };
afterEach(async () => { await clearCrashDraft(draft.id); await clearCrashDraft("older-test"); });

describe("crash recovery prompt", () => {
  it("stays hidden without a draft", () => {
    expect(renderToStaticMarkup(<CrashRecoveryDialog draft={null} />)).toBe("");
  });
  it.each([['en', 'Recover unsaved draft?', 'Restore draft', 'Discard'], ['zh', '恢复未保存的草稿？', '恢复草稿', '丢弃']])("renders the accessible prompt in %s", async (locale, title, restore, discard) => {
    await loadLocale(locale);
    const html = renderToStaticMarkup(<CrashRecoveryDialog draft={draft} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    for (const text of [title, restore, discard, draft.label]) expect(html).toContain(text);
  });
  it("returns no startup prompt when no draft exists", async () => {
    expect(await loadLatestCrashDraft()).toBeNull();
  });
  it("finds the latest draft regardless of the startup page ID", async () => {
    await saveCrashDraft("older-test", { width: 1 }, { savedAt: 1 });
    await saveCrashDraft(draft.id, draft.document, { savedAt: 2 });
    expect((await loadLatestCrashDraft()).id).toBe(draft.id);
  });
  it("restores the scene as the current unsaved document and clears the draft", async () => {
    await saveCrashDraft(draft.id, draft.document);
    const close = vi.fn();
    await resolveCrashRecovery(draft, true, useDesignStore.getState(), close);
    expect(close).toHaveBeenCalledOnce();
    const state = useDesignStore.getState();
    expect(state.welcomeOpen).toBe(false);
    expect(state.isDirty).toBe(true);
    expect(state.fileName).toBe(draft.label);
    expect(state.filePath).toBeNull();
    expect(state.nodes.find(n => n.id === state.editingNodeId).data.editorDoc).toEqual(draft.document);
    expect(await loadCrashDraft(draft.id)).toBeNull();
  });
  it("discards without opening a document", async () => {
    const store = { restoreCrashDraft: vi.fn() };
    await saveCrashDraft(draft.id, draft.document);
    const close = vi.fn();
    await resolveCrashRecovery(draft, false, store, close);
    expect(close).toHaveBeenCalledOnce();
    expect(store.restoreCrashDraft).not.toHaveBeenCalled();
    expect(await loadCrashDraft(draft.id)).toBeNull();
  });
  it("disables both actions while resolving the draft", () => {
    const onRestore = vi.fn(), onDiscard = vi.fn();
    const tree = CrashRecoveryDialog;
    const html = renderToStaticMarkup(React.createElement(tree, { draft, onRestore, onDiscard, busy: true }));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
