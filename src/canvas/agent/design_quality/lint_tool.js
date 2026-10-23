import { lintDesign } from './lint.js';

export const LINT_TOOL_SCHEMA = {
  type: 'function',
  function: {
    name: 'lint_design',
    description: 'Read-only design quality review with scores, node IDs and suggested fixes.',
    parameters: { type: 'object', properties: { rootId: { type: 'string' } } },
  },
};
export function lintDesignTool({ rootId } = {}, editor = globalThis.window?.__vooEditor) {
  if (!editor?.getDocument) throw new Error('agentNoEditor');
  if (rootId !== undefined && typeof rootId !== 'string') throw new TypeError('rootId must be a string');
  return lintDesign(editor.getDocument(), { rootId });
}
