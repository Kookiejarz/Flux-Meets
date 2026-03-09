#!/bin/sh

set -e

# cd to the directory this script is in
cd "$(dirname "$0")"

OUTDIR="../public/e2ee/wasm-pkg"

# This example requires to *not* create ES modules, therefore we pass the flag
# `--target no-modules`
RUSTFLAGS="-C target-feature=+simd128 --cfg=web_sys_unstable_apis" wasm-pack build --target no-modules --out-dir "$OUTDIR"

# Copy flux_mls_worker to orange_mls_worker (legacy naming)
cp "$OUTDIR/flux_mls_worker.js" "$OUTDIR/orange_mls_worker.js"
cp "$OUTDIR/flux_mls_worker_bg.wasm" "$OUTDIR/orange_mls_worker_bg.wasm"
cp "$OUTDIR/flux_mls_worker.d.ts" "$OUTDIR/orange_mls_worker.d.ts"
cp "$OUTDIR/flux_mls_worker_bg.wasm.d.ts" "$OUTDIR/orange_mls_worker_bg.wasm.d.ts"

# Emit versioned flux aliases so path-based CDN caches can be busted by changing the worker entry path.
cp "$OUTDIR/flux_mls_worker.js" "$OUTDIR/flux_mls_worker.v2.js"
cp "$OUTDIR/flux_mls_worker_bg.wasm" "$OUTDIR/flux_mls_worker_bg.v2.wasm"
