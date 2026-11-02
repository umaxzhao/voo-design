#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --locked --manifest-path native/voo-engine/Cargo.toml --release --target wasm32-unknown-unknown
wasm-bindgen native/voo-engine/target/wasm32-unknown-unknown/release/voo_engine.wasm --target web --out-dir src/engine-wasm/generated
if command -v wasm-opt >/dev/null; then
  wasm-opt -Oz src/engine-wasm/generated/voo_engine_bg.wasm -o src/engine-wasm/generated/optimized.wasm
  mv src/engine-wasm/generated/optimized.wasm src/engine-wasm/generated/voo_engine_bg.wasm
fi
