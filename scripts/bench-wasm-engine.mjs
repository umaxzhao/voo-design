import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { createWasmScene } from '../src/engine-wasm/wasm.js';
import { ReferenceScene } from '../src/engine-wasm/reference.js';
const bytes = readFileSync(new URL('../src/engine-wasm/generated/voo_engine_bg.wasm', import.meta.url));
console.log(`# WASM engine microbench\n\nNode ${process.version}; ${process.platform}/${process.arch}. Times are median µs/query over five samples of 200 queries after 100 warmups. Includes boundary calls, sorting and result copy; excludes scene upload. JS is the independent linear reference, not the editor R-tree. No browser FPS claim.\n\nWASM: ${bytes.length} raw bytes; ${gzipSync(bytes).length} gzip bytes.\n\n| Nodes | JS hit | WASM hit | JS cull | WASM cull |\n| ---: | ---: | ---: | ---: | ---: |`);
let checksum = 0;
function measure(fn) {
  for (let i = 0; i < 100; i++) checksum += fn(i);
  const samples = [];
  for (let s = 0; s < 5; s++) { const start = performance.now(); for (let i = 0; i < 200; i++) checksum += fn(i); samples.push((performance.now() - start) * 1000 / 200); }
  return samples.sort((a,b) => a-b)[2].toFixed(2);
}
for (const n of [1000, 5000, 20000, 100000]) {
  const ops = new Float32Array(n * 7);
  for (let i = 0; i < n; i++) { const x = i % 400 * 40, y = Math.floor(i / 400) * 40; ops.set([1,i,x,y,x+30,y+30,i],i*7); }
  const js = new ReferenceScene(), wasm = await createWasmScene(bytes);
  js.apply(ops); wasm.apply(ops);
  const hit = scene => measure(i => scene.hitTest(i % 100 * 40 + 10, Math.floor(i / 100) * 40 + 10));
  const cull = scene => measure(i => scene.query(i * 13 % 12000, 0, i * 13 % 12000 + 800, 600).length);
  console.log(`| ${n} | ${hit(js)} | ${hit(wasm)} | ${cull(js)} | ${cull(wasm)} |`);
  js.free(); wasm.free();
}
console.log(`\nChecksum: ${checksum}. Uniformly spaced 30×30 bounds, 40-unit spacing; 800×600 viewport. Large queries and dense overlaps can degrade to O(N).`);
