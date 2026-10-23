# WASM engine phase 2 benchmark

Node v20.19.2; linux/x64. Median microseconds per operation, five samples, 100 warmups and 200 timed queries; mutation batches use 5 warmups and 20 timed batches. Query results include sorting/copying. A hit is topmost AABB, not an exact shape hit. Production JS uses buildSpatialIndex/syncSpatialIndex from viewport_culling.js and its real SpatialIndex R-tree.

WASM: 42783 raw bytes; 18466 gzip bytes.

| Nodes | Backend | Hit µs | Cull µs | Update 1% µs | Drag 100 µs |
| ---: | :--- | ---: | ---: | ---: | ---: |
| 1000 | Linear | 35.83 | 47.69 | 23.71 | 134.63 |
| 1000 | Editor R-tree | 6.98 | 19.93 | 361.56 | 794.15 |
| 1000 | WASM journal | 2.86 | 17.47 | 90.50 | 335.72 |
| 5000 | Linear | 173.76 | 178.44 | 75.06 | 136.04 |
| 5000 | Editor R-tree | 9.06 | 41.81 | 1120.27 | 1179.64 |
| 5000 | WASM journal | 4.07 | 76.40 | 259.44 | 432.48 |
| 20000 | Linear | 1331.08 | 1394.04 | 385.14 | 138.99 |
| 20000 | Editor R-tree | 2.72 | 81.58 | 5443.92 | 5588.31 |
| 20000 | WASM journal | 3.23 | 117.04 | 1678.58 | 1639.28 |
| 100000 | Linear | 17583.91 | 18846.48 | 1560.70 | 121.87 |
| 100000 | Editor R-tree | 0.77 | 54.18 | 39274.68 | 28441.74 |
| 100000 | WASM journal | 3.56 | 100.84 | 10024.29 | 7853.31 |

Checksum: 6864348. Uniform 30×30 nodes on 40-unit spacing; 800×600 cull viewport. Linear mutation timings exclude immutable document construction and are a kernel reference only. Editor and WASM timings include document construction; WASM journals avoid the R-tree's identity scan and include consuming native dirty tiles/rectangles each mutation batch. No browser, CanvasKit raster or end-to-end FPS measurements. Dense overlaps/giant viewports can degrade to O(N).
