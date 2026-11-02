import type { SkiaTextGlyphLayout } from "./skia-text-hit-test.js";
export interface NativeTextEditingState {
    text: string;
    selectionStart: number;
    selectionEnd: number;
    compositionText: string;
    isComposing: boolean;
}
export interface NativeTextEditingRenderState extends NativeTextEditingState {
    caretVisible: boolean;
}
type TextEditingPointerHandler = (point: {
    x: number;
    y: number;
}, phase: "start" | "move" | "end", clickCount: number) => void;
export declare function setNativeTextEditingRenderState(nodeId: string, state: NativeTextEditingRenderState): void;
export declare function setNativeTextEditingLayout(nodeId: string, layout: SkiaTextGlyphLayout): void;
export declare function getNativeTextEditingLayout(nodeId: string): SkiaTextGlyphLayout | null;
export declare function getNativeTextEditingRenderState(nodeId: string): NativeTextEditingRenderState | null;
export declare function clearNativeTextEditingRenderState(nodeId: string): void;
export declare function registerNativeTextEditingPointerHandler(nodeId: string, handler: TextEditingPointerHandler): () => void;
export declare function dispatchNativeTextEditingPointer(point: {
    x: number;
    y: number;
}, phase: "start" | "move" | "end", clickCount: number): boolean;
export declare function subscribeNativeTextEditingInvalidation(listener: () => void): () => void;
export declare function initTextEditing(initialText: string, caretIndex?: number): NativeTextEditingState;
/**
 * Returns the string CanvasKit must lay out for the current editing state.
 * A plain selection never changes glyph positions; only an active IME
 * composition visually replaces the selected range.
 */
export declare function getNativeTextEditingDisplayText(state: NativeTextEditingState): string;
export declare function updateCompositionText(state: NativeTextEditingState, compositionText: string): NativeTextEditingState;
export declare function commitCompositionText(state: NativeTextEditingState, committedText: string): NativeTextEditingState;
export declare function setSelection(state: NativeTextEditingState, start: number, end: number): NativeTextEditingState;
export declare function insertText(state: NativeTextEditingState, textToInsert: string): NativeTextEditingState;
export declare function deleteSelection(state: NativeTextEditingState): NativeTextEditingState;
export declare function deleteForward(state: NativeTextEditingState): NativeTextEditingState;
export declare function selectAllText(state: NativeTextEditingState): NativeTextEditingState;
export declare function moveCaret(state: NativeTextEditingState, direction: "left" | "right" | "home" | "end", expandSelection?: boolean): NativeTextEditingState;
export declare function moveCaretToIndex(state: NativeTextEditingState, targetIndex: number, expandSelection?: boolean): NativeTextEditingState;
export declare function moveCaretWord(state: NativeTextEditingState, direction: "left" | "right", expandSelection?: boolean): NativeTextEditingState;
export declare function selectWordAt(state: NativeTextEditingState, index: number): NativeTextEditingState;
export declare function selectParagraphAt(state: NativeTextEditingState, index: number): NativeTextEditingState;
export {};
//# sourceMappingURL=skia-native-text-editing.d.ts.map