/**
 * Draft state for the design-system editor. The draft is a working copy of the
 * selected system; it only reaches the registry through an explicit save.
 */
function draftOf(system) {
  return {
    tokens: structuredClone(system.designTokens),
    designMd: system.designMd ?? "",
  };
}

export function initialEditorState(system) {
  return {
    selectedId: system.id,
    ...draftOf(system),
    dirty: false,
    renaming: false,
    confirmingDelete: false,
  };
}

export function editorReducer(state, action) {
  switch (action.type) {
    case "select":
      return initialEditorState(action.system);
    case "tokens":
      return { ...state, tokens: action.tokens, dirty: true };
    case "markdown":
      return { ...state, designMd: action.designMd, dirty: true };
    case "saved":
      return { ...initialEditorState(action.system) };
    case "rename":
      return { ...state, renaming: action.value, confirmingDelete: false };
    case "confirmDelete":
      return { ...state, confirmingDelete: action.value, renaming: false };
    default:
      throw new Error(`Unknown editor action: ${action.type}`);
  }
}
