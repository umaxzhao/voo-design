import { validateDesignSystem } from './schema.js';
export function getActiveDesignSystem(doc) {
  const result = validateDesignSystem(doc?.designSystem);
  return result.ok ? result.value : null;
}
export function setActiveDesignSystem(editor, ds) {
  const result = validateDesignSystem(ds);
  if (!result.ok) throw Object.assign(new Error(result.errors.join('\n')), {errors:result.errors});
  const doc = editor?.getDocument?.() ?? editor?.getDoc?.();
  if (!doc) throw new Error('The editor does not expose a document');
  const next = {...doc,designSystem:result.value};
  const method = ['setDoc','updateDocument','setDocument','applyDocument'].find(k => typeof editor[k] === 'function');
  if (method) editor[method](next,{name:'AI: Set design system'});
  else {
    doc.designSystem = result.value;
    editor.commitEditorDocument?.({message:'AI: Set design system'});
    editor.requestRender?.();
  }
  return result.value;
}
