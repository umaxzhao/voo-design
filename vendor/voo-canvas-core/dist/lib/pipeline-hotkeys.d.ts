export declare function matchUnmodifiedKey(e: KeyboardEvent, letter: string): boolean;
export declare function matchShiftLetter(e: KeyboardEvent, letter: string): boolean;
export declare function matchSubmitKey(e: KeyboardEvent): boolean;
export declare function isRunnableNodeType(type: string | undefined | null): boolean;
export declare function isProviderExecutorNodeType(type: string | undefined | null): boolean;
export interface PipelineGuardInput {
    selectedId: string | null;
    /** Node type at selectedId; undefined when the node was deleted. */
    nodeType: string | undefined;
    isGenerating: boolean;
}
export declare function canRunSelected(input: PipelineGuardInput): boolean;
export declare function canPreviewSelected(input: Omit<PipelineGuardInput, "isGenerating">): boolean;
export interface IterateGuardInput {
    selectedId: string | null;
    nodeType: string | undefined;
    hasOutput: boolean;
}
export declare function canIterateSelected(input: IterateGuardInput): boolean;
//# sourceMappingURL=pipeline-hotkeys.d.ts.map