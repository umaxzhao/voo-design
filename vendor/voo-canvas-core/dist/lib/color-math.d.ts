export interface Hsv {
    h: number;
    s: number;
    v: number;
}
export interface Rgb {
    r: number;
    g: number;
    b: number;
}
export declare function hexToRgb(hex: string): Rgb | null;
export declare function rgbToHex({ r, g, b }: Rgb): string;
export declare function normalizeHex(input: string): string | null;
export declare function hexAlphaPercent(hex: string): number;
export declare function withAlpha(hex: string, opacityPercent: number): string;
export declare function hexToHsv(hex: string): Hsv;
export declare function hsvToHex(h: number, s: number, v: number): string;
//# sourceMappingURL=color-math.d.ts.map