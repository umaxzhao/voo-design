# Remediation Worker Dispatch — Iteration 2

You are Worker Remediation (`teamwork_preview_worker`).
Your working directory is: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_remediation_1`
Project root: `/Users/tt/teamwork_projects/voo_design`

## Mandatory First Step
Read the authoritative user request at:
`/Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md`
And the project blueprint:
`/Users/tt/teamwork_projects/voo_design/PROJECT.md`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

---

## Context: Gate Failure in Iteration 1

In Iteration 1, the Forensic Auditor issued an **INTEGRITY VIOLATION** and Reviewer 2 issued **REQUEST_CHANGES** due to two specific defects exposed under churn and roundtrip serialization.

### Full Evidence Report from Forensic Auditor (`auditor_1`)

#### 1. Algorithmic Defect in `src/canvas/editor/spatial_index.js:178-199`
```javascript
178:   insert(rawItem) {
179:     const item = normalizeItem(rawItem);
180:     if (!item) return;
181: 
182:     this._insert(item, this.data.height - 1);
183:     this._size += 1;
184:   }
185: 
186:   _insert(item, level) {
187:     const insertPath = [];
188:     let node = this.data;
189: 
190:     // 1. Choose subtree to insert into down to target level
191:     while (!node.leaf && insertPath.length < this.data.height - level - 1) {
192:       insertPath.push(node);
193:       node = this._chooseSubtree(node, item);
194:     }
195: 
196:     insertPath.push(node);
197:     node.children.push(item);
198:     this._extendNodeBBox(node, item);
```
- Line 182 passes `level = this.data.height - 1`.
- Line 191 calculates `this.data.height - level - 1` which equals `0`.
- Because `insertPath.length < 0` is false immediately, the loop never descends on non-leaf nodes.
- At line 197, `node` remains the root node (`this.data`). If `this.data.leaf === false` (e.g. after bulk loading via `load()` or when tree height > 1), `node.children.push(item)` pushes a raw leaf item directly into an internal branch node.
- At search time, `search` visits this internal node, treats `item` as a branch node, and attempts `item.children.length`, crashing with `TypeError: Cannot read properties of undefined (reading 'length')`.

**Exact Auditor Remediation**:
1. In `insert(rawItem)`:
   Change `this._insert(item, this.data.height - 1);` to `this._insert(item, 1);` (Leaf items belong at leaf level 1).
2. In `_insert(item, level)`:
   Change `while (!node.leaf && insertPath.length < this.data.height - level - 1)` to `while (!node.leaf && insertPath.length < this.data.height - level)`.

---

### Full Evidence Report from Reviewer 2 (`reviewer_2`)

#### 2. Root Condensation in `src/canvas/editor/spatial_index.js:348-350`
In `remove()`:
```javascript
// Condense root if it only has 1 non-leaf child
if (!this.data.leaf && this.data.children.length === 1) {
  this.data = this.data.children[0];
}
```
When items are repeatedly removed during dynamic churn, `this.data.children.length` drops to 1. If `this.data.children[0]` is a leaf item `{ id, minX, ... }` rather than a node, `this.data` becomes that raw item. On the next `search()` call, `this.data` is evaluated with `node.children`, which is `undefined`, throwing `TypeError`.
**Exact Fix**:
```javascript
if (!this.data.leaf && this.data.children.length === 1) {
  const onlyChild = this.data.children[0];
  if (onlyChild && onlyChild.children && !onlyChild.id) {
    this.data = onlyChild;
  }
} else if (this.data.children.length === 0) {
  this.clear();
}
```

#### 3. Blob Serialization in `src/canvas/figma/figma-to-voo.js` & `src/canvas/figma/fig-kiwi-writer.js`
In `pruneFigSource`: `fig-kiwi-writer.js:122` expects `Blob.bytes` to exist for all blob entries. If `blobs` is purged or stripped, reverse Kiwi binary serialization throws `Error: fig-kiwi: missing required Blob.bytes`.
**Exact Fix**:
In `src/canvas/figma/figma-to-voo.js`, ensure that if `blobs` is retained or pruned, any surviving `Blob` records have `bytes: new Uint8Array(0)` rather than undefined, or preserve `blobs` when roundtrip serialization is requested.

#### 4. Adversarial Streaming Test Assertions in `tests/unit/adversarial_figma_streaming_corruption.test.js`
Verify that all 24 tests in `tests/unit/adversarial_figma_streaming_corruption.test.js` pass cleanly (including the layer count assertion at line 534).

---

## Your Assigned Tasks

1. **Fix `src/canvas/editor/spatial_index.js`**:
   - Apply the auditor's exact fix for `insert()` level calculation and `_insert()` descent loop.
   - Apply the reviewer's exact fix for `remove()` root condensation.
   - Verify with `npx vitest run tests/unit/spatial_index.test.js tests/unit/challenger_spatial_viewport_stress.test.js`.

2. **Fix `src/canvas/figma/figma-to-voo.js`**:
   - Ensure `blobs` in `figSource` does not cause `fig-kiwi-writer.js` to throw `missing required Blob.bytes`.
   - Verify with `npx vitest run tests/unit/adversarial_figma_streaming_corruption.test.js`.

3. **Verify Full Quality Gates**:
   - Run `npm test` across ALL test files (must be 100% passing, 0 failures).
   - Run `npm run build` (must complete cleanly with exit code 0).
   - Run `npm run lint:design` (must report 0 violations).

4. **Output Report**:
   - Write comprehensive `handoff.md` to `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_remediation_1/handoff.md`.
   - Send completion message to orchestrator with all test and build results.


## 2026-10-21T00:41:32Z
You are Worker Remediation (teamwork_preview_worker).
Your working directory is: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/teamwork_preview_worker_remediation_1
Project root: /Users/tt/teamwork_projects/voo_design
