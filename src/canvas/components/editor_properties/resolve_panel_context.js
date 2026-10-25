import { TOOL } from '../../editor/tool_ids.js';

const base = ['alignment', 'transform', 'constraints', 'layoutChild', 'layer'];
const paint = ['fill', 'stroke', 'effects', 'export'];
/** Product contract: tool properties and object properties share one dynamic inspector.
 * Active tools own the panel until the user returns to an object selection mode.
 * Sections listed here are the minimal default set for a type; extras (live
 * filters, modifiers, variables, styles, constraints, export) are reached
 * through the panel's single add menu, not listed here.
 */
export const PROPERTY_SECTIONS = Object.freeze({
  rectangle: [...base, 'radius', ...paint],
  frame: [...base, 'radius', 'clip', 'autoLayout', 'layoutGrid', ...paint],
  ellipse: [...base, 'arc', ...paint],
  polygon: [...base, 'shape', ...paint],
  star: [...base, 'shape', ...paint],
  line: [...base, 'stroke', 'effects', 'export'],
  vector: [...base, ...paint],
  text: [...base, 'typography', ...paint],
  group: [...base, 'autoLayout', 'effects', 'export'],
  component: [...base, 'component', 'radius', 'autoLayout', ...paint],
  instance: [...base, 'component', ...paint],
  // An image is a rectangle with an image fill, so it gets the rectangle panel.
  image: [...base, 'radius', ...paint],
  adjustment: ['adjustments', 'layer', 'export'],
  brush: ['transform', 'layer', 'effects', 'export'],
  media: ['transform', 'layer', 'media', 'export'],
});
export function propertyType(node) {
  if (node.isFrame || node.kind === 'frame') return 'frame';
  if (node.kind === 'canvasInstance' || node.kind === 'instance') return 'instance';
  if (node.isComponent || node.kind === 'component') return 'component';
  if (node.kind === 'rect' || node.kind === 'rectangle') return 'rectangle';
  if (node.kind === 'path') {
    if (node.line || node.arrow) return 'line';
    if (node.poly) return node.star ? 'star' : 'polygon';
    return 'vector';
  }
  if (['video', 'audio', 'model3d'].includes(node.kind)) return 'media';
  return PROPERTY_SECTIONS[node.kind] ? node.kind : 'vector';
}
const objectSelectionTools = new Set([
  TOOL.SELECT,
  TOOL.SELECT_REGION,
  TOOL.PERSPECTIVE,
  TOOL.DISTORT,
  TOOL.PUPPET_WARP,
]);

export function resolvePanelForContext({ tool = TOOL.SELECT, selection = [] } = {}) {
  const activeTool = tool ?? TOOL.SELECT;
  const nodes = Array.isArray(selection)
    ? selection.filter(Boolean)
    : selection
      ? [selection]
      : [];

  // The inspector follows the active tool until the user returns to an object
  // selection mode. This keeps drawing controls stable even when a layer is
  // selected, while Select exposes the selected node's transform and style.
  if (!objectSelectionTools.has(activeTool)) return { panel: 'tool', sections: [] };

  if (nodes.length) {
    const type = propertyType(nodes[0]);
    // Intersection prevents irrelevant paint/radius controls in mixed selections.
    const sections = PROPERTY_SECTIONS[type].filter((section) =>
      nodes.every((node) => PROPERTY_SECTIONS[propertyType(node)].includes(section)),
    );
    return { panel: 'properties', sections };
  }
  return { panel: 'background', sections: [] };
}
