import { findNode, isRegionNode } from "./scene_doc_factory.js";
import { fromNodeLocal, toNodeLocal } from "./scene_geometry.js";

/** How finely an elliptical region's outline is sampled. */
const REGION_ELLIPSE_SEGMENTS = 48;

/** An ellipse ring in a region's own local coordinates. */
function ellipseRegionRing(region) {
  const radiusX = region.width / 2;
  const radiusY = region.height / 2;
  const centreX = region.x + radiusX;
  const centreY = region.y + radiusY;
  const ring = [];
  for (let i = 0; i < REGION_ELLIPSE_SEGMENTS; i += 1) {
    const angle = (i / REGION_ELLIPSE_SEGMENTS) * Math.PI * 2;
    ring.push({
      x: centreX + Math.cos(angle) * radiusX,
      y: centreY + Math.sin(angle) * radiusY,
    });
  }
  return ring;
}

/**
 * Migrates legacy regions (drawn before regions attached to pictures) onto
 * their host images.
 *
 * A region stored in document coordinates with no hostId is converted to
 * the host image's local space: whichever image contains the region's centre
 * becomes its host, and the box is mapped into that image's pixels — four
 * corners through the image's transform, then the local bounding box. A
 * region with no covering image, drawn on empty page, is dropped, because
 * the model has no page to hang an annotation on any more.
 */
export function attachRegionsToHosts(doc) {
  if (!doc || !Array.isArray(doc.nodes)) return doc;
  const hosts = doc.nodes.filter(
    (node) => node.kind === "image" && node.visible !== false,
  );
  let changed = false;
  const nodes = doc.nodes.map((node) => {
    if (!isRegionNode(node) || node.hostId) return node;
    // Any hostless region needs handling — attached to a covering image, or
    // dropped when none covers it.
    changed = true;
    const centre = {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    };
    const host = hosts.find((candidate) => {
      const local = toNodeLocal(candidate, centre);
      return (
        local.x >= 0 &&
        local.x <= candidate.width &&
        local.y >= 0 &&
        local.y <= candidate.height
      );
    });
    if (!host) return null;
    const corners = [
      { x: node.x, y: node.y },
      { x: node.x + node.width, y: node.y },
      { x: node.x + node.width, y: node.y + node.height },
      { x: node.x, y: node.y + node.height },
    ].map((point) => toNodeLocal(host, point));
    const box = corners.reduce(
      (acc, point) => {
        acc.x = Math.min(acc.x, point.x);
        acc.y = Math.min(acc.y, point.y);
        acc.width = Math.max(acc.width, point.x);
        acc.height = Math.max(acc.height, point.y);
        return acc;
      },
      { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity },
    );
    changed = true;
    return {
      ...node,
      hostId: host.id,
      x: box.x,
      y: box.y,
      width: box.width - box.x,
      height: box.height - box.y,
    };
  });
  if (!changed) return doc;
  return { ...doc, nodes: nodes.filter(Boolean) };
}

/**
 * The host image a region annotates, or null when it is missing or no longer
 * an image — a region with no host paints nothing and answers no hit tests.
 */
export function regionHost(doc, region) {
  if (!region?.hostId) return null;
  const host = findNode(doc, region.hostId);
  return host && host.kind === "image" ? host : null;
}

/**
 * Maps a document-space point into a region's local (host-image) space, or
 * null when the region has no host.
 */
export function regionLocalPoint(doc, region, docPoint) {
  const host = regionHost(doc, region);
  if (!host) return null;
  return toNodeLocal(host, docPoint);
}

/**
 * The region's outline in document space, through its host image's transform.
 *
 * A rectangle becomes its four corners mapped through the host (a rotated
 * picture turns the box into a parallelogram), a freehand region its mapped
 * point chain. Callers that only need a rough extent use the returned `box`.
 *
 * @returns {{points: Array<{x: number, y: number}>, box: {x, y, width, height}}}
 */
export function regionOutlineInDoc(doc, region) {
  const host = regionHost(doc, region);
  if (!host) return null;
  const corners = region.points?.length
    ? region.points
    : region.shape === "ellipse"
      ? ellipseRegionRing(region)
      : [
          { x: region.x, y: region.y },
          { x: region.x + region.width, y: region.y },
          { x: region.x + region.width, y: region.y + region.height },
          { x: region.x, y: region.y + region.height },
        ];
  const points = corners.map((point) => fromNodeLocal(host, point));
  const box = points.reduce(
    (acc, point) => {
      acc.x = Math.min(acc.x, point.x);
      acc.y = Math.min(acc.y, point.y);
      acc.width = Math.max(acc.width, point.x);
      acc.height = Math.max(acc.height, point.y);
      return acc;
    },
    { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity },
  );
  return {
    points,
    box: {
      x: box.x,
      y: box.y,
      width: box.width - box.x,
      height: box.height - box.y,
    },
  };
}
