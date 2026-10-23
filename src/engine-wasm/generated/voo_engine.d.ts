/* tslint:disable */
/* eslint-disable */
export class Scene {
  free(): void;
  output_ptr(): number;
  take_dirty(): Float32Array;
  take_tiles(): Int32Array;
  reserve_ops(count: number): number;
  tile_bucket(bucket: number): void;
  transforms_ptr(): number;
  constructor();
  apply(count: number): void;
  query(x: number, y: number, r: number, b: number): number;
  hit_test(x: number, y: number): number;
  draw_list(x: number, y: number, r: number, b: number): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_scene_free: (a: number, b: number) => void;
  readonly scene_apply: (a: number, b: number) => void;
  readonly scene_draw_list: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly scene_hit_test: (a: number, b: number, c: number) => number;
  readonly scene_new: () => number;
  readonly scene_output_ptr: (a: number) => number;
  readonly scene_query: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly scene_reserve_ops: (a: number, b: number) => number;
  readonly scene_take_dirty: (a: number, b: number) => void;
  readonly scene_take_tiles: (a: number, b: number) => void;
  readonly scene_tile_bucket: (a: number, b: number) => void;
  readonly scene_transforms_ptr: (a: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export_0: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
