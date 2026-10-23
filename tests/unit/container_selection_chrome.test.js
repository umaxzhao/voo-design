import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/canvas/editor/scene_renderer.js', () => ({draw: vi.fn(), resizeCanvas: vi.fn()}));
import { draw } from '../../src/canvas/editor/scene_renderer.js';
import { renderEngineStage } from '../../src/canvas/editor/editor_engine_render.js';

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
