import { isPlainRectList } from "./render_plain_rects.js";
import { documentToScene } from "./skia_scene_adapter.js";
import { cachedElementFor } from "./skia-rect-scene-cache.js";

/** Cache the unchanged painter runs around one edited rectangle. */
export function createSkiaRectPreview({
  minimumNodes = 1000
} = {}) {
  let previousNodes = null;
  let signature = null;
  let split = null;
  const clear = () => {
    split?.below.delete();
    split?.above.delete();
    split = null;
  };
  return {
    dispose() {
      clear();
      previousNodes = null;
      signature = null;
    },
    draw(instance, frame) {
      const doc = frame.docs[0];
      const kit = instance.canvasKit;
      if (frame.docs.length !== 1 || !kit?.PictureRecorder || !instance.painter || !doc || !Array.isArray(doc.nodes) || doc.nodes.length < minimumNodes || !isPlainRectList(doc.nodes) || !doc.isCanvasRoot && doc.clipContent === false || doc.rotation || doc.flipX || doc.flipY || doc.flipH || doc.flipV || doc.shear || doc.cornerRadius || doc.stroke || doc.fills?.length || doc.fillHidden || (doc.opacity ?? 1) !== 1 || Object.keys(doc.effects ?? {}).length) {
        clear();
        previousNodes = null;
        signature = null;
        return false;
      }
      const layout = (frame.layouts instanceof Map ? frame.layouts.get(doc.id) : frame.layouts?.[doc.id]) ?? doc.layout ?? doc.bounds ?? {};
      const x = layout.x ?? 0;
      const y = layout.y ?? 0;
      const key = JSON.stringify([doc.id, doc.isCanvasRoot, doc.width, doc.height, doc.backgroundColor, doc.fillOpacity, x, y]);
      if (signature !== key) {
        clear();
        previousNodes = null;
        signature = key;
      }
      let changed = -1;
      const base = split?.nodes ?? previousNodes;
      if (!base || base.length !== doc.nodes.length) {
        clear();
        previousNodes = doc.nodes;
        return false;
      }
      if (base?.length === doc.nodes.length) {
        for (let index = 0; index < base.length; index++) {
          if (base[index] === doc.nodes[index]) continue;
          if (changed !== -1) {
            changed = -2;
            break;
          }
          changed = index;
        }
      }
      previousNodes = doc.nodes;
      if (changed === -2 || changed === -1 && !split) {
        clear();
        return false;
      }
      if (changed < 0) changed = split.index;
      const record = (start, end) => {
        const recorder = new kit.PictureRecorder();
        try {
          let bounds = [x, y, x + doc.width, y + doc.height];
          if (doc.isCanvasRoot) {
            // Free artwork may live on either side of the origin or beyond page metadata.
            let left = Infinity,
              top = Infinity,
              right = -Infinity,
              bottom = -Infinity;
            for (let index = start; index < end; index++) {
              const node = doc.nodes[index];
              left = Math.min(left, x + node.x);
              top = Math.min(top, y + node.y);
              right = Math.max(right, x + node.x + node.width);
              bottom = Math.max(bottom, y + node.y + node.height);
            }
            bounds = Number.isFinite(left) ? [left, top, right, bottom] : [x, y, x + 1, y + 1];
          }
          const target = recorder.beginRecording(bounds);
          for (let index = start; index < end; index++) {
            if (doc.nodes[index].visible === false) continue;
            instance.painter.drawElement(target, cachedElementFor(doc.nodes[index], index, x, y, undefined, doc));
          }
          return recorder.finishRecordingAsPicture();
        } finally {
          recorder.delete();
        }
      };
      if (!split || changed !== split.index) {
        clear();
        const below = record(0, changed);
        let above;
        try {
          above = record(changed + 1, doc.nodes.length);
        } catch (error) {
          below.delete();
          throw error;
        }
        split = {
          below,
          above,
          nodes: doc.nodes,
          index: changed
        };
      }
      const surface = instance.acquireSurface();
      const canvas = surface.getCanvas();
      const viewport = frame.viewport;
      instance.painter.setCurrentContext?.(frame.snapshot, viewport);
      canvas.clear(kit.parseColorString(frame.snapshot.backgroundColor));
      canvas.save();
      try {
        canvas.scale(viewport.devicePixelRatio, viewport.devicePixelRatio);
        canvas.translate(viewport.x, viewport.y);
        canvas.scale(viewport.zoom, viewport.zoom);
        if (!doc.isCanvasRoot) {
          instance.painter.drawElement(canvas, documentToScene({
            ...doc,
            nodes: []
          }, {
            offsetX: x,
            offsetY: y
          })[0]);
          canvas.clipRect([x, y, x + doc.width, y + doc.height], kit.ClipOp.Intersect, true);
        }
        canvas.drawPicture(split.below);
        if (doc.nodes[changed].visible !== false) {
          instance.painter.drawElement(canvas, cachedElementFor(doc.nodes[changed], changed, x, y, undefined, doc));
        }
        canvas.drawPicture(split.above);
      } finally {
        canvas.restore();
      }
      surface.flush();
      return true;
    }
  };
}
