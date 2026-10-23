# WASM engine microbench

Node v20.19.2; linux/x64. Times are median µs/query over five samples of 200 queries after 100 warmups. Includes boundary calls, sorting and result copy; excludes scene upload. JS is the independent linear reference, not the editor R-tree. No browser FPS claim.

WASM: 34170 raw bytes; 15140 gzip bytes.

| Nodes | JS hit | WASM hit | JS cull | WASM cull |
| ---: | ---: | ---: | ---: | ---: |
| 1000 | 29.86 | 1.63 | 50.52 | 17.08 |
| 5000 | 135.36 | 2.21 | 128.13 | 50.42 |
| 20000 | 1173.77 | 1.86 | 1103.84 | 83.47 |
| 100000 | 22451.64 | 2.04 | 27076.43 | 85.39 |

Checksum: 4229296. Uniformly spaced 30×30 bounds, 40-unit spacing; 800×600 viewport. Large queries and dense overlaps can degrade to O(N).
