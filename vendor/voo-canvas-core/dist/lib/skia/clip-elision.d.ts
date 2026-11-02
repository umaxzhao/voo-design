import type { SceneElement } from "./scene-types.js";
type ClippableElement = Exclude<SceneElement, {
    kind: "connection";
}>;
/**
 * True when clipping `element` to `container` could remove any ink.
 *
 * Imported design files mark almost every wrapper frame as clipping — a
 * 16×16 icon frame around a 16×16 icon — and setting up a clip costs far more
 * than the draw it guards. A clip whose region already contains everything
 * the element can paint is dropped instead of being handed to Skia.
 */
export declare function clipCanConstrain(container: ClippableElement, element: ClippableElement): boolean;
export {};
//# sourceMappingURL=clip-elision.d.ts.map