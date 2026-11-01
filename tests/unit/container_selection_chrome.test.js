import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/canvas/editor/scene_renderer.js', () => ({draw: vi.fn(), resizeCanvas: vi.fn()}));
import { draw } from '../../src/canvas/editor/scene_renderer.js';
import { renderEngineStage } from '../../src/canvas/editor/editor_engine_render.js';
import { drawSelection } from '../../src/canvas/editor/chrome_selection.js';

function render(selectedContainer = null) {
  globalThis.window = { devicePixelRatio: 1 };
  const child = {id:'child',kind:'rect',x:40,y:50,width:30,height:20};
  const frame = {id:'frame',kind:'group',isFrame:true,x:10,y:10,width:200,height:150};
  const noop = () => null;
  renderEngineStage({
    ctx: {}, canvas: {}, stage: {clientWidth:800,clientHeight:600},
    doc: {width:800,height:600,nodes:[frame,child]},
    selection: {getId:()=>child.id,getIds:()=>['child','other']},
    selectedContainer, tool:'select', getEffectiveNode:n=>n,
    viewportTools:{getViewport:()=>({zoom:1,x:0,y:0})},
    crop:{getCropRect:noop}, annotations:{getEditingTextId:noop,getEditingRegionId:noop},
    maskTools:{api:{getLasso:noop},maskSourceOf:noop},
    paintTools:{bitmapSourceOf:noop},
    penTools:{api:{getEdit:noop,getDraft:noop,insertionPreview:noop}},
  });
  return draw.mock.calls.at(-1)[1];
}

describe('container selection chrome',()=>{
 it('draws only the selected frame bounds while retaining descendant ids for transforms',()=>{
  const frame={id:'frame',kind:'group',isFrame:true,x:10,y:10,width:200,height:150};
  const options=render(frame);
  expect(options.selectionSet).toBeNull();
  expect(options.selectionNode).toEqual(frame);
  expect(options.selectionRect).toEqual({x:10,y:10,width:200,height:150});
  expect(options.selectionHandles).toBe(true);
 });
 it('keeps ordinary multi-selection outlines',()=>{
  expect(render().selectionSet.map(n=>n.id)).toEqual(['child']);
 });
});

describe('one CSS pixel selection frame', () => {
 it.each([1, 2])('preserves the inset and 8 × 8 handles at %ix DPR', (dpr) => {
  // The renderer scales the backing context by DPR; chrome uses CSS coordinates.
  const strokes = [];
  const fills = [];
  const ctx = {
   save: vi.fn(), restore: vi.fn(),
   strokeRect(...rect) { strokes.push({ rect, width: this.lineWidth }); },
   fillRect(...rect) { fills.push(rect); },
  };
  drawSelection(ctx, { x: 10, y: 20, width: 100, height: 60 },
   { zoom: 1, panX: 0, panY: 0 }, true);
  expect(strokes[0]).toEqual({ rect: [10.5, 20.5, 98.5, 58.5], width: 1 });
  // The left/top stroke starts exactly on the integer CSS boundary.
  expect((strokes[0].rect[0] - strokes[0].width / 2) * dpr).toBe(10 * dpr);
  expect(strokes[0].width * dpr).toBe(dpr);
  expect(fills).toHaveLength(4);
  for (const [index, rect] of fills.entries()) {
   expect(rect.slice(2)).toEqual([8, 8]);
   expect(strokes[index + 1]).toEqual({ rect, width: 1 });
   expect(rect.slice(2).map(size => size * dpr)).toEqual([8 * dpr, 8 * dpr]);
  }
  // Existing paintHandle rounding adds 1 CSS px after frameCentre's 0.5 px
  // inset. Handles still cover the frame corners; preserve that placement.
  expect(fills[0]).toEqual([7.5, 17.5, 8, 8]);
  expect(fills[0][0] + 4 - strokes[0].rect[0]).toBe(1);
 });
});

describe('selection size label placement', () => {
 it('keeps the dimensions below the frame and within the visible stage', () => {
  const labels = [];
  const ctx = {
   canvas: { width: 400, height: 300 },
   getTransform: () => ({ a: 2 }),
   save() {}, restore() {}, strokeRect() {}, fillRect() {}, beginPath() {},
   roundRect(...rect) { labels.push(rect); }, fill() {},
   measureText: () => ({ width: 100 }), fillText() {},
  };
  drawSelection(ctx, { x: 20, y: 40, width: 60, height: 20 },
   { zoom: 1, panX: 0, panY: 0 }, true, { kind: 'rect', width: 60, height: 20 });

  expect(labels).toHaveLength(1);
  expect(labels[0]).toEqual([4, 66, 110, 18, 2]);
 });
});


describe('selection size label viewport policy', () => {
 it.each([
  { zoom: 0.5, dpr: 1, y: 40, height: 20, top: 36 },
  { zoom: 2, dpr: 2, y: 40, height: 20, top: 126 },
  { zoom: 1, dpr: 2, y: 1, height: 20, top: 27 },
  { zoom: 1, dpr: 2, y: 260, height: 20, top: 236 },
 ])('places readable chrome at $zoom zoom / $dpr DPR (y=$y)', ({ zoom, dpr, y, height, top }) => {
  const labels = [];
  const text = [];
  const ctx = {
   canvas: { width: 400 * dpr, height: 300 * dpr },
   getTransform: () => ({ a: dpr }),
   save() {}, restore() {}, strokeRect() {}, fillRect() {}, beginPath() {},
   roundRect(...rect) { labels.push(rect); }, fill() {},
   measureText: () => ({ width: 40 }), fillText(value) { text.push(value); },
  };
  drawSelection(ctx, { x: 100, y, width: 60, height },
   { zoom, panX: 0, panY: 0 }, true, { kind: 'rect', width: 60, height });
  expect(labels[0][1]).toBe(top);
  expect(labels[0][3]).toBe(18);
  expect(text).toEqual([`60 × ${height}`]);
 });
});
