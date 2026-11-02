/**
 * A still of a component for places that can only show an image, such as a
 * 3D frame where an instance is a textured plane. Overrides are applied, so
 * the plane shows this instance and not the bare main component.
 */
import { documentToSvg } from "./editor_svg.js";
import { applyInstanceOverrides } from "./instance-overrides.js";
import { withInstanceCamera, withInstanceView } from "./instance-view.js";

// Keyed by the source document object, then by the instance's overrides, so
// a scene that redraws every frame does not re-serialise the component.
const cache = new WeakMap();

export function instanceSnapshotUrl(sourceDoc, instance, resolveCanvas = null) {
  if (!sourceDoc) return null;
  const key = JSON.stringify(instance?.overrides ?? {});
  let byOverrides = cache.get(sourceDoc);
  if (!byOverrides) {
    byOverrides = new Map();
    cache.set(sourceDoc, byOverrides);
  }
  if (!byOverrides.has(key)) {
    try {
      const renderedDoc = withInstanceCamera(
        withInstanceView(applyInstanceOverrides(sourceDoc, instance), instance),
        instance,
      );
      const svg = documentToSvg(renderedDoc, { resolveCanvas });
      byOverrides.set(
        key,
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      );
    } catch {
      return null;
    }
  }
  return byOverrides.get(key);
}
