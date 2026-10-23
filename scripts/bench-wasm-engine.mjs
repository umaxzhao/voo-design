import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { createWasmScene } from '../src/engine-wasm/wasm.js';
import { buildSpatialIndex, syncSpatialIndex } from '../src/canvas/editor/viewport_culling.js';
import { EditorWasmIndex } from '../src/engine-wasm/editor-index.js';
import { updateNodes } from '../src/canvas/editor/doc_ops_nodes.js';
import { ReferenceScene } from '../src/engine-wasm/reference.js';
const bytes = readFileSync(new URL('../src/engine-wasm/generated/voo_engine_bg.wasm', import.meta.url));
console.log(`# WASM engine phase 2 benchmark

Node ${process.version}; ${process.platform}/${process.arch}. Median microseconds per operation, five samples, 100 warmups and 200 timed queries; mutation batches use 5 warmups and 20 timed batches. Query results include sorting/copying. A hit is topmost AABB, not an exact shape hit. Production JS uses buildSpatialIndex/syncSpatialIndex from viewport_culling.js and its real SpatialIndex R-tree.

WASM: ${bytes.length} raw bytes; ${gzipSync(bytes).length} gzip bytes.

| Nodes | Backend | Hit µs | Cull µs | Update 1% µs | Drag 100 µs |
| ---: | :--- | ---: | ---: | ---: | ---: |`);
let checksum = 0;
function measure(fn, mutation = false) {
  const warm = mutation ? 5 : 100, count = mutation ? 20 : 200;
  for (let i = 0; i < warm; i++) checksum += fn(i);
  const samples = [];
  for (let s = 0; s < 5; s++) {
    const start = performance.now();
    for (let i = 0; i < count; i++) checksum += fn(i);
    samples.push((performance.now() - start) * 1000 / count);
  }
  return samples.sort((a,b) => a-b)[2].toFixed(2);
}
for (const n of [1000, 5000, 20000, 100000]) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: String(i), kind: 'rect', x: i % 400 * 40,
    y: Math.floor(i / 400) * 40, width: 30, height: 30, rotation: 0 }));
  const ops = Float32Array.from(nodes.flatMap((v, i) => [1,i,v.x,v.y,v.x+30,v.y+30,i]));
  const linear = new ReferenceScene(); linear.apply(ops);
  let tree = buildSpatialIndex(nodes);
  let native;
  for (const backend of ['Linear', 'Editor R-tree', 'WASM journal']) {
    let doc = { nodes };
    if (backend === 'WASM journal') {
      native = new EditorWasmIndex(await createWasmScene(bytes)).sync(nodes);
      native.takeDirtyTiles(1);
    }
    const query = (x,y,r,b) => backend === 'Linear' ? linear.query(x,y,r,b) :
      backend === 'Editor R-tree' ? tree.search({minX:x,minY:y,maxX:r,maxY:b}).sort((a,b)=>Number(a.id)-Number(b.id)) :
      native.search({minX:x,minY:y,maxX:r,maxY:b});
    const hit = measure(i => {
      const x=i%100*40+10,y=Math.floor(i/100)*40+10;
      const ids=query(x,y,x,y);
      return ids.length ? Number(backend === 'Linear' ? ids[ids.length-1] : ids[ids.length-1].id) : -1;
    });
    const cull = measure(i => query(i*13%12000+1,1,i*13%12000+801,601).length);
    // Includes immutable document construction in both editor paths. Ordinary
    // updates change width; drag changes x/y and exercises native opcode 2.
    const mutate = (count, drag) => measure(i => {
      const updates = Array.from({length:count}, (_, k) => ({id:String(k), patch: drag ?
        {x:nodes[k].x+(i%2 ? 10:0),y:nodes[k].y+5} : {width:i%2 ? 31:30}}));
      if (backend === 'Linear') {
        const batch = Float32Array.from(updates.flatMap(({id,patch}) => {
          const v=nodes[Number(id)],x=patch.x??v.x,y=patch.y??v.y;
          return [1,Number(id),x,y,x+(patch.width??v.width),y+v.height,Number(id)];
        }));
        linear.apply(batch);
      } else {
        doc = updateNodes(doc, updates);
        if (backend === 'Editor R-tree') tree=syncSpatialIndex(tree,doc.nodes);
        else { native.sync(doc.nodes); native.takeDirtyTiles(1); native.scene.takeDirty(); }
      }
      return count;
    }, true);
    console.log(`| ${n} | ${backend} | ${hit} | ${cull} | ${mutate(Math.ceil(n*.01),false)} | ${mutate(100,true)} |`);
  }
  linear.free(); native.free();
}
console.log(`
Checksum: ${checksum}. Uniform 30×30 nodes on 40-unit spacing; 800×600 cull viewport. Linear mutation timings exclude immutable document construction and are a kernel reference only. Editor and WASM timings include document construction; WASM journals avoid the R-tree's identity scan and include consuming native dirty tiles/rectangles each mutation batch. No browser, CanvasKit raster or end-to-end FPS measurements. Dense overlaps/giant viewports can degrade to O(N).`);
