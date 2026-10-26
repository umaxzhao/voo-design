# WASM engine phase 2 benchmark

Node v26.7.0; darwin/arm64. Median microseconds per operation, five samples, 100 warmups and 200 timed queries; mutation batches use 5 warmups and 20 timed batches. Query results include sorting/copying. A hit is topmost AABB, not an exact shape hit. Production JS uses buildSpatialIndex/syncSpatialIndex from viewport_culling.js and its real SpatialIndex R-tree.

WASM: 42002 raw bytes; 18425 gzip bytes.

| Nodes | Backend | Hit µs | Cull µs | Update 1% µs | Drag 100 µs |
| ---: | :--- | ---: | ---: | ---: | ---: |
| 1000 | Linear | 20.52 | 21.55 | 7.47 | 51.77 |
| 1000 | Editor R-tree | 0.50 | 5.83 | 69.93 | 148.03 |
| 1000 | WASM journal | 2.13 | 7.85 | 40.83 | 99.71 |
| 5000 | Linear | 94.86 | 99.90 | 21.65 | 45.10 |
| 5000 | Editor R-tree | 1.45 | 21.12 | 367.62 | 367.10 |
| 5000 | WASM journal | 1.52 | 32.36 | 166.39 | 195.37 |
| 20000 | Linear | 380.64 | 371.46 | 81.80 | 37.87 |
| 20000 | Editor R-tree | 0.30 | 25.85 | 1743.24 | 1598.73 |
| 20000 | WASM journal | 1.62 | 46.95 | 667.92 | 539.62 |
| 100000 | Linear | 2916.14 | 2461.33 | 413.02 | 38.21 |
| 100000 | Editor R-tree | 0.28 | 28.34 | 12563.04 | 10448.25 |
| 100000 | WASM journal | 1.54 | 53.37 | 4337.76 | 2794.56 |

Checksum: 6864348. Uniform 30×30 nodes on 40-unit spacing; 800×600 cull viewport. Linear mutation timings exclude immutable document construction and are a kernel reference only. Editor and WASM timings include document construction; WASM journals avoid the R-tree's identity scan and include consuming native dirty tiles/rectangles each mutation batch. No browser, CanvasKit raster or end-to-end FPS measurements. Dense overlaps/giant viewports can degrade to O(N).

Rebuilt locally on 2026-10-27 with wasm-bindgen-cli 0.2.100. Four native Rust correctness tests pass (z-order/removal, translation, large/negative bounds, dirty regions/tiles). The feature remains off by default: mutation batches beat the production R-tree here, but point/cull queries do not. These numbers do not establish a browser FPS improvement.
