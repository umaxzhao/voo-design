import { TOOL } from '../../editor/tool_ids.js';

const base = ['alignment', 'transform', 'constraints', 'layoutChild', 'layer'];
const paint = ['fill', 'stroke', 'effects', 'export'];
/** Product contract: panels are dynamic, never a permanent tool column.
 * Selection wins over drawing defaults; a shape inspector is only for drawing
 * with nothing selected. Sections listed here are the minimal default set for
 * a type; extras (live filters, modifiers, variables, styles, constraints,
 * export) are reached through the panel's single add menu, not listed here.
 * Raster tools put their options in the right panel (no top option bar).
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
  image: ['transform', 'image', 'layer', 'effects', 'export'],
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
const rasterTools = new Set(['brush', 'eraser', 'healing', 'retouch', 'blur', 'sharpen', 'smudge', 'dodge', 'burn', 'sponge', 'crop', 'marquee', 'lasso', 'wand', 'region', 'select_region', 'ai_select']);
/** Raster tools whose options own the whole panel, even over a selection (as in voo-run). */
const toolOptionTools = new Set([...rasterTools].filter(tool => !['retouch', 'select_region', 'ai_select'].includes(tool)));
const drawingTools = new Set(['rect', 'ellipse', 'polygon', 'star', 'line', 'arrow', 'pen', 'curvature_pen', 'free_pen', 'text', 'dropper', 'fill', 'gradient']);
export function resolvePanelForContext({ tool = TOOL.SELECT, selection = [] } = {}) {
  const nodes = Array.isArray(selection) ? selection.filter(Boolean) : selection ? [selection] : [];
  if (nodes.length) {
    const type = propertyType(nodes[0]);
    // Intersection prevents irrelevant paint/radius controls in mixed selections.
    const sections = PROPERTY_SECTIONS[type].filter(section => nodes.every(node => PROPERTY_SECTIONS[propertyType(node)].includes(section)));
    return { panel: 'properties', sections, toolOptions: toolOptionTools.has(tool) ? tool : null };
  }
  if (rasterTools.has(tool)) return { panel: 'tool', sections: [], toolOptions: tool };
  if (drawingTools.has(tool)) return { panel: 'tool', sections: [], toolOptions: null };
  return { panel: 'background', sections: [], toolOptions: null };
}
