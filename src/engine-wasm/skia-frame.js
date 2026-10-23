import { elementFor } from '../canvas/editor/skia_adapter_elements.js';
import { wasmEngineEnabled, loadEditorWasmIndex } from './editor-index.js';
import { TilePictures } from './tile-pictures.js';
import { isPlainRectList } from '../canvas/editor/render_plain_rects.js';
import { documentToScene } from '../canvas/editor/skia_scene_adapter.js';
// Intentionally narrow: complex clipping, effects, media, multi-page layouts and
// resource-dependent content retain the authoritative Skia composition path.
export function createWasmSkiaFrames() {
  const tiles = new TilePictures();
  let identity;
  let ownedIndex = null;
  let loading = null;
  let disposed = false;
  const eligibility = new WeakMap();
  function eligible(doc) {
    if (!doc || doc.timeline || !isPlainRectList(doc.nodes)) return false;
    if (!eligibility.has(doc.nodes)) eligibility.set(doc.nodes, doc.nodes.every(n =>
      !n.shadow && !n.fills?.length && !n.strokes?.length && !n.maskId && !n.isMask &&
      !n.animations?.length && !n.timing && !n.clipContent && !n.filter &&
      !(Array.isArray(n.effects) && n.effects.some(e => e.enabled !== false))));
    return eligibility.get(doc.nodes);
  }
  return {
    async prepare(docs, supplied) {
      if (supplied?.drawList) return docs.length === 1 ? supplied.sync(docs[0].nodes) : supplied;
      if (disposed || !wasmEngineEnabled() || docs.length !== 1 || !eligible(docs[0])) return supplied;
      try {
        loading ??= loadEditorWasmIndex();
        const index = await loading;
        if (disposed) return supplied;
        ownedIndex = index;
        return index.sync(docs[0].nodes);
      } catch { return supplied; }
    },
    clear: () => { tiles.clear(); disposed = true;
      if (ownedIndex) ownedIndex.free();
      else loading?.then(index => index.free(), () => {});
    },
    draw(instance, docs, index, viewport, rect, backgroundColor, layouts) {
      const doc = docs[0];
      const layout = layouts instanceof Map ? layouts.get(doc?.id ?? doc?.canvasId) : layouts?.[doc?.id ?? doc?.canvasId];
      if (docs.length !== 1 || (layout && (layout.x || layout.y)) || !index?.drawList || !index?.takeDirtyTiles ||
          !doc || doc.layout || doc.bounds || doc.rotation || doc.flipX || doc.flipY || (doc.effects && Object.keys(doc.effects).length) ||
          doc.stroke || doc.fills?.length || doc.cornerRadius || (doc.opacity ?? 1) !== 1 ||
          !eligible(doc) || !instance.canvasKit || !instance.painter) {
        tiles.clear(); return false;
      }
      index.sync(doc.nodes);
      const kit = instance.canvasKit;
      const surface = instance.acquireSurface();
      const canvas = surface.getCanvas();
      const pageKey = JSON.stringify([doc.id, doc.width, doc.height, doc.backgroundColor, doc.clipContent]);
      if (identity !== pageKey) { tiles.clear(); identity = pageKey; }
      canvas.clear(kit.parseColorString(backgroundColor));
      canvas.save();
      try {
        canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
        canvas.translate(viewport.x, viewport.y); canvas.scale(viewport.zoom, viewport.zoom);
        const frame = documentToScene({ ...doc, nodes: [] }, {})[0];
        instance.painter.drawElement(canvas, frame);
        if (doc.clipContent !== false) canvas.clipRect([0, 0, doc.width, doc.height], kit.ClipOp.Intersect, true);
        const dirty = index.takeDirtyTiles(viewport.zoom);
        // Bound tile enumeration on extreme zoom-out/oversized viewports.
        if ((Math.ceil((rect.maxX-rect.minX)/dirty.size)+2) *
            (Math.ceil((rect.maxY-rect.minY)/dirty.size)+2) > 256) { tiles.clear(); return false; }
        tiles.draw(kit, canvas, dirty, rect, (target, box) => {
          const { ids, transforms } = index.drawList(box);
          for (let i = 0; i < ids.length; i++) {
            const item = index.items[ids[i]];
            if (!item || item.node.visible === false) continue;
            const node = item.drawNode;
            const element = elementFor(node, i, 0, 0, undefined, doc);
            target.save();
            target.translate(transforms[i * 6 + 4], transforms[i * 6 + 5]);
            instance.painter.drawElement(target, element);
            target.restore();
          }
        });
      } finally { canvas.restore(); }
      surface.flush();
      return true;
    },
  };
}
