export type TextCase = "original" | "upper" | "lower" | "title";
export type TextListStyle = "bulleted" | "numbered" | "none";
export interface TextDisplaySource {
    text?: string;
    textCase?: TextCase;
    textListStyle?: TextListStyle;
}
export declare function applyTextCase(value: string, textCase: TextCase | undefined): string;
export declare function applyTextListStyle(value: string, listStyle: TextListStyle | undefined): string;
export declare function getDisplayText(node: TextDisplaySource): string;
//# sourceMappingURL=text-display.d.ts.map