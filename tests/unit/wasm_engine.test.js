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
