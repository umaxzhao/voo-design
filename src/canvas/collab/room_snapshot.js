/**
 * Collab room snapshot serialization (plan 2.6).
 *
 * The signalling server stores no documents and the room's document lives in
 * each member's IndexedDB — so clearing browser data during a long offline
 * fork permanently loses that member's contribution. A snapshot embeds the
 * local images as data URLs (unlike the portable export, which keeps only
 * remote HTTPS references) so the file is a self-contained copy of the room's
 * state that survives any storage wipe.
 *
 * Pure so the serialization rule is unit-testable.
 */

import { stripTransientNodeState } from "../nodes/types.js";

/**
 * Builds a self-contained room snapshot document.
 *
 * @param {object} input
 * @param {string} input.name workflow name
 * @param {Array<object>} input.nodes live graph nodes
 * @param {Array<object>} input.edges live graph edges
 * @param {Record<string, string>} input.images id -> data URL (already resolved)
 * @returns {object} versioned document with images embedded
 */
export function buildRoomSnapshot({
  name,
  nodes = [],
  edges = [],
  images = {},
}) {
  return {
    version: 2,
    name: name ?? "",
    nodes: stripTransientNodeState(nodes),
    edges,
    images,
  };
}
