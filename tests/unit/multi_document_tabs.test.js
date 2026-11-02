import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignStore } from '../../src/store/design_store.js';
import { createHistory } from '../../src/canvas/editor/editor_history.js';
const store = () => useDesignStore.getState();
const initial = useDesignStore.getInitialState();
beforeEach(() => useDesignStore.setState(initial, true));
/** Opens the first document the way the welcome page does and returns its id. */
function openFirstDocument(label = 'A') {
  store().newVooProject({ label });
  return store().activeDocumentId;
}
describe('document tabs', () => {
  it('starts with no document tab and replaces nothing when New is clicked from welcome', () => {
    expect(store().welcomeOpen).toBe(true);
    expect(store().openDocuments).toEqual([]);
    expect(store().activeDocumentId).toBeNull();
    store().newVooProject();
    expect(store().openDocuments).toHaveLength(1);
    expect(store().openDocuments[0].id).toBe(store().activeDocumentId);
    expect(store().fileName).toBe('Design 1.voo');
    expect(store().welcomeOpen).toBe(false);
  });
  it('keeps the welcome page when asked to return to a canvas that does not exist', () => {
    store().setWelcomeOpen(false);
    expect(store().welcomeOpen).toBe(true);
    openFirstDocument();
    store().setWelcomeOpen(true);
    store().setWelcomeOpen(false);
    expect(store().welcomeOpen).toBe(false);
  });
  it('keeps live content, file identity, dirty state and camera independently', () => {
    const a = openFirstDocument();
    const doc = { ...store().nodes[0].data.editorDoc, label: 'edited A' };
    const camera = { panX: 45, panY: 22, zoom: 2 };
    const handle = {};
    useDesignStore.setState({ editorPageDocumentReader: () => doc, editorCamera: camera, fileHandle: handle, fileName: 'A.voo', isDirty: true });
    store().newVooProject({ label: 'B' });
    const b = store().activeDocumentId;
    expect(store().openDocuments).toHaveLength(2);
    expect(store().isDirty).toBe(false);
    useDesignStore.setState({ editorPageDocumentReader: null, isDirty: true });
    store().switchDocument(a);
    expect(store().nodes[0].data.editorDoc).toBe(doc);
    expect(store().fileName).toBe('A.voo');
    expect(store().fileHandle).toBe(handle);
    expect(store().editorCamera).toEqual(camera);
    expect(store().isDirty).toBe(true);
    store().switchDocument(b);
    expect(store().fileName).toBe('B.voo');
    expect(store().fileHandle).toBeNull();
    expect(store().isDirty).toBe(true);
  });
  it('confirms dirty inactive and active tabs, selects a neighbor, and closes the last tab', () => {
    const a = openFirstDocument();
    store().setIsDirty(true);
    store().newVooProject({ label: 'B' });
    const b = store().activeDocumentId;
    const reject = vi.fn(() => false);
    expect(store().closeDocument(a, reject)).toBe(false);
    expect(reject).toHaveBeenCalledOnce();
    store().setIsDirty(true);
    expect(store().closeDocument(b, reject)).toBe(false);
    expect(store().closeDocument(b, () => true)).toBe(true);
    expect(store().activeDocumentId).toBe(a);
    store().closeDocument(a, () => true);
    expect(store().openDocuments).toEqual([]);
    expect(store().welcomeOpen).toBe(true);
    store().newVooProject();
    expect(store().openDocuments).toHaveLength(1);
  });
  it('opens an existing document alongside the previous document', () => {
    const a = openFirstDocument('Previous');
    const doc = store().nodes[0].data.editorDoc;
    store().loadVooProject({ vooData: { document: doc }, fileName: 'Opened.voo' });
    expect(store().openDocuments).toHaveLength(2);
    store().switchDocument(a);
    expect(store().fileName).toBe('Previous.voo');
  });
  it('opening an existing file from welcome leaves exactly one tab and no Untitled tab', () => {
    const doc = store().nodes[0].data.editorDoc;
    store().loadVooProject({ vooData: { document: doc }, fileName: 'Opened.voo' });
    expect(store().openDocuments).toHaveLength(1);
    expect(store().fileName).toBe('Opened.voo');
    expect(store().welcomeOpen).toBe(false);
    expect(store().openDocuments.some(item => item.fileName === 'Untitled.voo')).toBe(false);
  });
  it('restoring a crash draft from welcome opens one dirty tab', () => {
    const doc = store().nodes[0].data.editorDoc;
    store().restoreCrashDraft({ document: doc, label: 'Recovered.voo' });
    expect(store().openDocuments).toHaveLength(1);
    expect(store().fileName).toBe('Recovered.voo');
    expect(store().isDirty).toBe(true);
  });
  it('retains undo entries and the redo branch across runtime session restoration', () => {
    const a = createHistory();
    a.reset({ doc: { value: 0 } });
    a.push({ doc: { value: 1 } }, 'Edit A');
    a.push({ doc: { value: 2 } }, 'Edit A again');
    a.undo();
    const b = createHistory();
    b.restoreSession(a.captureSession());
    expect(b.getEntries()).toEqual(a.getEntries());
    expect(b.undo().doc.value).toBe(0);
    expect(b.redo().doc.value).toBe(1);
    expect(b.redo().doc.value).toBe(2);
  });
});
