use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;
const CELL: f32 = 256.;
#[wasm_bindgen]
pub struct Scene {
    x: Vec<f32>,
    y: Vec<f32>,
    right: Vec<f32>,
    bottom: Vec<f32>,
    z: Vec<f32>,
    alive: Vec<bool>,
    grid: HashMap<(i32, i32), HashSet<usize>>,
    large: HashSet<usize>,
    dirty: Vec<f32>,
    ops: Vec<f32>,
    out: Vec<u32>,
}
fn cells(b: [f32; 4]) -> Option<Vec<(i32, i32)>> {
    let [x, y, r, t] = b.map(|v| (v / CELL).floor() as i32);
    if r as i64 - x as i64 > 255
        || t as i64 - y as i64 > 255
        || (r as i64 - x as i64 + 1) * (t as i64 - y as i64 + 1) > 256
    {
        return None;
    }
    Some((x..=r).flat_map(|a| (y..=t).map(move |b| (a, b))).collect())
}
#[wasm_bindgen]
impl Scene {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Scene {
        Scene {
            x: vec![],
            y: vec![],
            right: vec![],
            bottom: vec![],
            z: vec![],
            alive: vec![],
            grid: HashMap::new(),
            large: HashSet::new(),
            dirty: vec![],
            ops: vec![],
            out: vec![],
        }
    }
    pub fn reserve_ops(&mut self, count: usize) -> *mut f32 {
        self.ops.resize(count * 7, 0.);
        self.ops.as_mut_ptr()
    }
    // [opcode (0 remove, 1 upsert), slot, minX, minY, maxX, maxY, z]
    pub fn apply(&mut self, count: usize) {
        for n in 0..count {
            let p = n * 7;
            let i = self.ops[p + 1] as usize;
            if i >= self.alive.len() {
                let len = i + 1;
                self.x.resize(len, 0.);
                self.y.resize(len, 0.);
                self.right.resize(len, 0.);
                self.bottom.resize(len, 0.);
                self.z.resize(len, 0.);
                self.alive.resize(len, false);
            }
            if self.alive[i] {
                let b = self.bounds(i);
                self.mark(b);
                if let Some(cs) = cells(b) {
                    for c in cs {
                        if let Some(s) = self.grid.get_mut(&c) {
                            s.remove(&i);
                            if s.is_empty() {
                                self.grid.remove(&c);
                            }
                        }
                    }
                } else {
                    self.large.remove(&i);
                }
            }
            self.alive[i] = self.ops[p] != 0.;
            if self.alive[i] {
                self.x[i] = self.ops[p + 2];
                self.y[i] = self.ops[p + 3];
                self.right[i] = self.ops[p + 4];
                self.bottom[i] = self.ops[p + 5];
                self.z[i] = self.ops[p + 6];
                let b = self.bounds(i);
                self.mark(b);
                if let Some(cs) = cells(b) {
                    for c in cs {
                        self.grid.entry(c).or_default().insert(i);
                    }
                } else {
                    self.large.insert(i);
                }
            }
        }
    }
    pub fn query(&mut self, x: f32, y: f32, r: f32, b: f32) -> usize {
        let mut ids = self.large.clone();
        if let Some(cs) = cells([x, y, r, b]) {
            for c in cs {
                if let Some(s) = self.grid.get(&c) {
                    ids.extend(s);
                }
            }
        } else {
            ids.extend((0..self.alive.len()).filter(|i| self.alive[*i]));
        }
        self.out = ids
            .into_iter()
            .filter(|&i| {
                self.alive[i]
                    && self.x[i] <= r
                    && self.right[i] >= x
                    && self.y[i] <= b
                    && self.bottom[i] >= y
            })
            .map(|i| i as u32)
            .collect();
        self.out.sort_unstable_by(|a, b| {
            self.z[*a as usize]
                .total_cmp(&self.z[*b as usize])
                .then(a.cmp(b))
        });
        self.out.len()
    }
    pub fn hit_test(&mut self, x: f32, y: f32) -> i32 {
        self.query(x, y, x, y);
        self.out.last().map_or(-1, |i| *i as i32)
    }
    pub fn output_ptr(&self) -> *const u32 {
        self.out.as_ptr()
    }
    pub fn take_dirty(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.dirty)
    }
}
impl Scene {
    fn bounds(&self, i: usize) -> [f32; 4] {
        [self.x[i], self.y[i], self.right[i], self.bottom[i]]
    }
    fn mark(&mut self, b: [f32; 4]) {
        if self.dirty.is_empty() {
            self.dirty.extend(b);
        } else {
            self.dirty[0] = self.dirty[0].min(b[0]);
            self.dirty[1] = self.dirty[1].min(b[1]);
            self.dirty[2] = self.dirty[2].max(b[2]);
            self.dirty[3] = self.dirty[3].max(b[3]);
        }
    }
}
