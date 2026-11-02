let activeRenderState = null;
let activeNodeId = null;
let activeLayout = null;
let pointerHandler = null;
const invalidationListeners = new Set();
export function setNativeTextEditingRenderState(nodeId, state) {
    activeNodeId = nodeId;
    activeRenderState = state;
    invalidationListeners.forEach((listener) => listener());
}
export function setNativeTextEditingLayout(nodeId, layout) {
    if (activeNodeId !== nodeId)
        return;
    activeLayout = layout;
}
export function getNativeTextEditingLayout(nodeId) {
    return activeNodeId === nodeId ? activeLayout : null;
}
export function getNativeTextEditingRenderState(nodeId) {
    return activeNodeId === nodeId ? activeRenderState : null;
}
export function clearNativeTextEditingRenderState(nodeId) {
    if (activeNodeId !== nodeId)
        return;
    activeNodeId = null;
    activeRenderState = null;
    activeLayout = null;
    pointerHandler = null;
    invalidationListeners.forEach((listener) => listener());
}
export function registerNativeTextEditingPointerHandler(nodeId, handler) {
    activeNodeId = nodeId;
    pointerHandler = handler;
    return () => {
        if (activeNodeId === nodeId && pointerHandler === handler) {
            pointerHandler = null;
        }
    };
}
export function dispatchNativeTextEditingPointer(point, phase, clickCount) {
    if (!pointerHandler)
        return false;
    pointerHandler(point, phase, clickCount);
    return true;
}
export function subscribeNativeTextEditingInvalidation(listener) {
    invalidationListeners.add(listener);
    return () => invalidationListeners.delete(listener);
}
export function initTextEditing(initialText, caretIndex) {
    const index = caretIndex !== undefined
        ? Math.max(0, Math.min(initialText.length, caretIndex))
        : initialText.length;
    return {
        text: initialText,
        selectionStart: index,
        selectionEnd: index,
        compositionText: "",
        isComposing: false,
    };
}
/**
 * Returns the string CanvasKit must lay out for the current editing state.
 * A plain selection never changes glyph positions; only an active IME
 * composition visually replaces the selected range.
 */
export function getNativeTextEditingDisplayText(state) {
    if (!state.isComposing)
        return state.text;
    const start = Math.min(state.selectionStart, state.selectionEnd);
    const end = Math.max(state.selectionStart, state.selectionEnd);
    return `${state.text.slice(0, start)}${state.compositionText}${state.text.slice(end)}`;
}
export function updateCompositionText(state, compositionText) {
    return {
        ...state,
        compositionText,
        isComposing: true,
    };
}
export function commitCompositionText(state, committedText) {
    const min = Math.min(state.selectionStart, state.selectionEnd);
    const max = Math.max(state.selectionStart, state.selectionEnd);
    const before = state.text.slice(0, min);
    const after = state.text.slice(max);
    const newText = before + committedText + after;
    const newIndex = min + committedText.length;
    return {
        text: newText,
        selectionStart: newIndex,
        selectionEnd: newIndex,
        compositionText: "",
        isComposing: false,
    };
}
export function setSelection(state, start, end) {
    const clampedStart = Math.max(0, Math.min(state.text.length, start));
    const clampedEnd = Math.max(0, Math.min(state.text.length, end));
    return {
        ...state,
        selectionStart: clampedStart,
        selectionEnd: clampedEnd,
    };
}
export function insertText(state, textToInsert) {
    return commitCompositionText(state, textToInsert);
}
export function deleteSelection(state) {
    if (state.selectionStart === state.selectionEnd) {
        if (state.selectionStart === 0)
            return state;
        const min = state.selectionStart - 1;
        const max = state.selectionStart;
        const before = state.text.slice(0, min);
        const after = state.text.slice(max);
        return {
            ...state,
            text: before + after,
            selectionStart: min,
            selectionEnd: min,
        };
    }
    return commitCompositionText(state, "");
}
export function deleteForward(state) {
    if (state.selectionStart !== state.selectionEnd)
        return deleteSelection(state);
    if (state.selectionEnd >= state.text.length)
        return state;
    return {
        ...state,
        text: state.text.slice(0, state.selectionEnd) + state.text.slice(state.selectionEnd + 1),
    };
}
export function selectAllText(state) {
    return setSelection(state, 0, state.text.length);
}
export function moveCaret(state, direction, expandSelection = false) {
    let targetIndex = state.selectionEnd;
    if (direction === "left") {
        targetIndex = Math.max(0, targetIndex - 1);
    }
    else if (direction === "right") {
        targetIndex = Math.min(state.text.length, targetIndex + 1);
    }
    else if (direction === "home") {
        targetIndex = 0;
    }
    else if (direction === "end") {
        targetIndex = state.text.length;
    }
    return {
        ...state,
        selectionStart: expandSelection ? state.selectionStart : targetIndex,
        selectionEnd: targetIndex,
    };
}
export function moveCaretToIndex(state, targetIndex, expandSelection = false) {
    const target = Math.max(0, Math.min(state.text.length, targetIndex));
    return {
        ...state,
        selectionStart: expandSelection ? state.selectionStart : target,
        selectionEnd: target,
    };
}
export function moveCaretWord(state, direction, expandSelection = false) {
    const text = state.text;
    let idx = state.selectionEnd;
    if (direction === "left") {
        while (idx > 0 && /\s/.test(text[idx - 1]))
            idx--;
        while (idx > 0 && !/\s/.test(text[idx - 1]))
            idx--;
    }
    else {
        while (idx < text.length && /\s/.test(text[idx]))
            idx++;
        while (idx < text.length && !/\s/.test(text[idx]))
            idx++;
    }
    return {
        ...state,
        selectionStart: expandSelection ? state.selectionStart : idx,
        selectionEnd: idx,
    };
}
export function selectWordAt(state, index) {
    const text = state.text;
    let start = Math.max(0, Math.min(text.length, index));
    let end = start;
    while (start > 0 && !/\s/.test(text[start - 1]))
        start--;
    while (end < text.length && !/\s/.test(text[end]))
        end++;
    return setSelection(state, start, end);
}
export function selectParagraphAt(state, index) {
    const text = state.text;
    let start = Math.max(0, Math.min(text.length, index));
    let end = start;
    while (start > 0 && text[start - 1] !== "\n")
        start--;
    while (end < text.length && text[end] !== "\n")
        end++;
    return setSelection(state, start, end);
}
//# sourceMappingURL=skia-native-text-editing.js.map