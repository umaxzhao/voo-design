import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createWasmScene } from '../../src/engine-wasm/wasm.js';
import { ReferenceScene } from '../../src/engine-wasm/reference.js';
import { buildSpatialIndex } from '../../src/canvas/editor/viewport_culling.js';
import { EditorWasmIndex, wasmEngineEnabled } from '../../src/engine-wasm/editor-index.js';
const bytes = readFileSync(new URL('../../src/engine-wasm/generated/voo_engine_bg.wasm', import.meta.url));
describe('native scene parity', () => {
  it('matches incremental edits, deletion, z order, giant bounds and dirty consumption', async () => {
    const a = new ReferenceScene(), b = await createWasmScene(bytes);
    const batches = [
      [1,0,-100,-100,100,100,2, 1,1,0,0,30,30,5, 1,2,-1e6,-1e6,1e6,1e6,-1],
      [1,1,256,256,300,300,5, 0,0,0,0,0,0,0],
      [1,0,256,256,300,300,5],
    ];
    for (const batch of batches) {
      a.apply(Float32Array.from(batch)); b.apply(Float32Array.from(batch));
      expect(b.takeDirty()).toEqual(a.takeDirty()); expect(b.takeDirty()).toEqual(a.takeDirty());
      for (const [x,y,r,t] of [[0,0,0,0],[-200,-200,400,400],[256,256,256,256],[-Infinity,-Infinity,Infinity,Infinity],[2e6,2e6,3e6,3e6]]) {
        expect(b.query(x,y,r,t)).toEqual(a.query(x,y,r,t));
        expect(b.hitTest(x,y)).toBe(a.hitTest(x,y));
      }
    }
    a.free(); b.free();
  });
  it('matches deterministic random batches through memory growth', async () => {
    const a = new ReferenceScene(), b = await createWasmScene(bytes);
    let seed = 123;
    const rand = () => (seed = (Math.imul(seed,1664525)+1013904223)>>>0)/2**32;
    for (let round = 0; round < 4; round++) {
      const ops = [];
      for (let i = 0; i < 5000; i++) { const x=rand()*10000-5000,y=rand()*10000-5000; ops.push(round && i%7===0 ? 0:1,i,x,y,x+rand()*500,y+rand()*500,i%13); }
      a.apply(Float32Array.from(ops)); b.apply(Float32Array.from(ops));
      expect(b.takeDirty()).toEqual(a.takeDirty());
      for (let i=0;i<100;i++) { const x=rand()*10000-5000,y=rand()*10000-5000; expect(b.query(x,y,x+600,y+600)).toEqual(a.query(x,y,x+600,y+600)); expect(b.hitTest(x,y)).toBe(a.hitTest(x,y)); }
    }
    a.free(); b.free();
  });
  it('preserves production index candidates for fractional and rotated visual bounds', async () => {
    const nodes = Array.from({length: 100}, (_, i) => ({id: `n${i}`,kind:'rect',x:i*17.13-500,y:i*3.19-100,width:35.17,height:45.31,rotation:i*7}));
    const native = new EditorWasmIndex(await createWasmScene(bytes)).sync(nodes);
    const js = buildSpatialIndex(nodes);
    for (let i=0;i<100;i++) {
      const item = js.all()[i];
      const box = {minX:item.minX,minY:item.minY,maxX:item.maxX,maxY:item.maxY};
      expect(native.search(box).map(v=>v.id).sort()).toEqual(js.search(box).map(v=>v.id).sort());
      const point = {x:item.minX,y:item.minY};
      expect(native.pointQuery(point,24).map(v=>v.id).sort()).toEqual(js.pointQuery(point,24).map(v=>v.id).sort());
    }
    native.free();
  });
  it('adapts editor IDs, immutable changes, reordering and removals', async () => {
    expect(wasmEngineEnabled()).toBe(false);
    const index = new EditorWasmIndex(await createWasmScene(bytes));
    const node = (id,x) => ({id,kind:'rect',x,y:0,width:30,height:30,rotation:0});
    const a=node('a',0), b=node('b',20);
    index.sync([a,b]); expect(index.pointQuery({x:25,y:10}).map(v=>v.id)).toEqual(['a','b']);
    index.sync([b,{...a,x:100}]); expect(index.pointQuery({x:25,y:10}).map(v=>v.id)).toEqual(['b']);
    index.sync([]); expect(index.search({minX:-Infinity,minY:-Infinity,maxX:Infinity,maxY:Infinity})).toEqual([]);
    index.free();
  });
});

import { vi } from 'vitest';
import { updateNodes, withNodes } from '../../src/canvas/editor/doc_ops_nodes.js';
import { TilePictures } from '../../src/engine-wasm/tile-pictures.js';
import { createWasmSkiaFrames } from '../../src/engine-wasm/skia-frame.js';

it('batches mutation journals across skipped frames without scanning the next list', async () => {
  const index = new EditorWasmIndex(await createWasmScene(bytes));
  const node = (id,x) => ({id,kind:'rect',x,y:0,width:30,height:30,fill:'#123456'});
  let doc = { nodes: [node('a',0),node('b',20),node('c',600)] };
  index.sync(doc.nodes);
  const apply = vi.spyOn(index.scene, 'apply');
  doc = updateNodes(doc,[{id:'a',patch:{x:100}}]);
  doc = updateNodes(doc,[{id:'a',patch:{x:200}},{id:'b',patch:{fill:'#ffffff'}}]);
  const each = vi.spyOn(doc.nodes, 'forEach').mockImplementation(() => { throw new Error('render-time scan'); });
  index.sync(doc.nodes);
  expect(apply).toHaveBeenCalledTimes(1);
  expect(apply.mock.calls[0][0]).toHaveLength(14);
  expect(apply.mock.calls[0][0][0]).toBe(2);
  expect(index.pointQuery({x:210,y:10}).map(v=>v.id)).toEqual(['a']);
  each.mockRestore();
  doc = withNodes(doc, [doc.nodes[2], {...doc.nodes[0],id:'d'}]);
  index.sync(doc.nodes);
  expect(index.search({minX:-1000,minY:-1000,maxX:1000,maxY:1000}).map(v=>v.id)).toEqual(['c','d']);
  index.free();
});

it('matches native translations, old/new dirtiness and stable packed draw lists', async () => {
  const scene = await createWasmScene(bytes);
  scene.apply(Float32Array.from([1,0,10,20,40,50,2,1,1,10,20,40,50,1]));
  scene.takeDirty(); scene.takeTiles();
  const before = scene.drawList(-100,-100,100,100);
  expect([...before.ids]).toEqual([1,0]);
  expect([...before.transforms]).toEqual([1,0,0,1,0,0,1,0,0,1,0,0]);
  scene.apply(Float32Array.from([2,0,600,-100,0,0,0,2,1,-10,10,0,0,0]));
  expect([...scene.takeDirty()]).toEqual([0,-80,640,60]);
  const after = scene.drawList(-1000,-1000,1000,1000);
  expect([...after.transforms]).toEqual([1,0,0,1,-10,10,1,0,0,1,600,-100]);
  expect([...before.transforms]).toEqual([1,0,0,1,0,0,1,0,0,1,0,0]);
  expect(scene.hitTest(620,-70)).toBe(0);
  expect(scene.hitTest(25,25)).toBe(-1);
  scene.apply(Float32Array.from([1,0,0,0,20,20,2]));
  expect([...scene.drawList(0,0,20,20).transforms].slice(-6)).toEqual([1,0,0,1,0,0]);
  scene.free();
});

it('tracks old and new tiles, negative coordinates, zoom resets and oversized damage', async () => {
  const scene = await createWasmScene(bytes);
  expect([...scene.takeTiles()]).toEqual([1]);
  scene.apply(Float32Array.from([1,0,-10,-10,10,10,0]));
  expect([...scene.takeTiles()]).toEqual([0,-1,-1,-1,0,0,-1,0,0]);
  expect([...scene.takeTiles()]).toEqual([0]);
  scene.apply(Float32Array.from([2,0,1024,0,0,0,0]));
  const dirty = [...scene.takeTiles()];
  expect(dirty).toContain(2);
  scene.setTileBucket(1);
  expect([...scene.takeTiles()]).toEqual([1]);
  scene.apply(Float32Array.from([1,0,-1e30,-1e30,1e30,1e30,0]));
  expect([...scene.takeTiles()]).toEqual([1]);
  scene.free();
});

it('records only missing/dirty pictures and deletes invalidated, evicted and disposed pictures', () => {
  const made = [], record = vi.fn();
  const kit = { ClipOp: {Intersect:0}, PictureRecorder: class {
    beginRecording() { return {}; }
    finishRecordingAsPicture() { const p = {delete:vi.fn()}; made.push(p); return p; }
    delete() {}
  }};
  const canvas = {save(){},restore(){},clipRect(){},drawPicture:vi.fn()};
  const cache = new TilePictures(2);
  const rect = {minX:1,minY:1,maxX:511,maxY:511};
  const dirty = {bucket:0,size:512,reset:false,keys:new Int32Array()};
  cache.draw(kit,canvas,dirty,rect,record);
  cache.draw(kit,canvas,dirty,rect,record);
  expect(record).toHaveBeenCalledTimes(1);
  cache.draw(kit,canvas,{...dirty,keys:Int32Array.of(0,0)},rect,record);
  expect(made[0].delete).toHaveBeenCalledTimes(1);
  cache.draw(kit,canvas,dirty,{...rect,maxX:1200},record);
  expect(cache.pictures.size).toBe(2);
  cache.clear();
  expect(made.every(p=>p.delete.mock.calls.length===1)).toBe(true);
});

it('walks packed native transforms when recording SkPictures and replays clean tiles', async () => {
  const index = new EditorWasmIndex(await createWasmScene(bytes));
  let doc = {id:'page',width:1000,height:1000,backgroundColor:'#ffffff', nodes:[
    {id:'a',kind:'rect',x:10,y:20,width:30,height:30,fill:'#123456'}]};
  index.sync(doc.nodes);
  doc=updateNodes(doc,[{id:'a',patch:{x:20}}]); index.sync(doc.nodes);
  const translations = [], pictures = [];
  const target = {save(){},restore(){},translate:(...args)=>translations.push(args)};
  const canvas = {save(){},restore(){},scale(){},translate(){},clipRect(){},clear(){},drawPicture:vi.fn()};
  const kit = {parseColorString:v=>v,ClipOp:{Intersect:0},PictureRecorder:class {
    beginRecording(){return target;}
    finishRecordingAsPicture(){const p={delete:vi.fn()}; pictures.push(p); return p;}
    delete(){}
  }};
  const painter={drawElement:vi.fn()};
  const instance={canvasKit:kit,painter,acquireSurface:()=>({getCanvas:()=>canvas,flush(){}})};
  const frames=createWasmSkiaFrames();
  const args=[instance,[doc],index,{x:0,y:0,zoom:1,devicePixelRatio:1},
    {minX:1,minY:1,maxX:500,maxY:500},'#ffffff',null];
  expect(frames.draw(...args)).toBe(true);
  expect(translations).toContainEqual([10,0]);
  expect(pictures).toHaveLength(1);
  expect(frames.draw(...args)).toBe(true);
  expect(pictures).toHaveLength(1);
  frames.clear(); index.free();
  expect(pictures[0].delete).toHaveBeenCalledTimes(1);
});


it('keeps the default-off Skia path on the supplied JS index', async () => {
  const frames = createWasmSkiaFrames();
  const js = buildSpatialIndex([]);
  expect(await frames.prepare([{nodes:[]}],js)).toBe(js);
  frames.clear();
});


it('matches reference bounds and queries while dragging 100 nodes across grid cells', async () => {
  const a = new ReferenceScene(), b = await createWasmScene(bytes);
  const initial = Float32Array.from(Array.from({length:1000},(_,i) => {
    const x=i%40*40,y=Math.floor(i/40)*40;
    return [1,i,x,y,x+30,y+30,i];
  }).flat());
  a.apply(initial); b.apply(initial); a.takeDirty(); b.takeDirty();
  const saved = b.drawList(0,0,2000,2000);
  for (let round=0;round<20;round++) {
    const ops = Float32Array.from(Array.from({length:100},(_,i) =>
      [2,i,round%2 ? -37:259,round%3 ? 23:-300,0,0,0]).flat());
    a.apply(ops); b.apply(ops);
    expect(b.takeDirty()).toEqual(a.takeDirty());
    for (const box of [[-1000,-1000,1000,1000],[250,0,750,600],[0,0,0,0]]) {
      expect(b.query(...box)).toEqual(a.query(...box));
      expect(b.drawList(...box).ids).toEqual(a.query(...box));
    }
  }
  expect(saved.ids).toHaveLength(1000);
  expect([...saved.transforms].every((v,i)=>v === (i%6===0 || i%6===3 ? 1:0))).toBe(true);
  a.free(); b.free();
});
