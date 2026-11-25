# Vendored three.js (r186)

`libs/three/` vendors a reproducible three.js bundle for the JSR engine.

| File | Content |
|---|---|
| `source-pin.json` | The pinned upstream commit `9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8` (release tag `r186`), its tag object and source-tree hash. |
| `build.mjs` | esbuild IIFE build: global `THREE`, target `es2020`, minified, entry `src/Three.js` of the checkout. |
| `three.min.js` | The committed bundle (never edited by hand). |
| `three.min.js.sha256` | SHA-256 over the bundle bytes; proof of reproducibility. |
| `LICENSE` | The MIT license text of three.js at the pinned commit. |
| `three-shim.js` | Optional canvas shim for hosts without `document` (see below). |

## Boundary

- Pure-math classes (`Scene`, `Mesh`, `Object3D`, geometries, `Vector3`, `Matrix4`, `Quaternion`, `Euler`, materials) need no host, no `document`, no `window` at module init. They run in bare QuickJS 2024-01-13 as-is.
- Every renderer (`WebGLRenderer`, `WebGLCubeRenderTarget`) needs a canvas. In a browser the real `document` provides it. In a bare engine the host loads `three-shim.js` **after** `three.min.js` and registers `globalThis.__jsrCreateCanvas(type) -> host context`; `document.createElement('canvas').getContext(type)` then returns the host canvas. Without a registered host, `getContext` throws `Error('three.unsupported: canvas backend not available')`. The shim defines `document` only when it is undefined; a host with a real document is never touched.

## Injection order

The host preloads `three.min.js` before widget bootstrap (engine `evalGlobal`), then `three-shim.js` when the platform can provide a canvas backend.

## Rebuild and verify

```bash
git clone --filter=blob:none --no-checkout https://github.com/mrdoob/three.js.git /tmp/jsr-three-r186
git -C /tmp/jsr-three-r186 checkout "$(python3 -c "import json; print(json.load(open('libs/three/source-pin.json'))['commit'])")"
node libs/three/build.mjs --source /tmp/jsr-three-r186            # rewrites three.min.js + hash
node libs/three/build.mjs --source /tmp/jsr-three-r186 --verify   # exits 1 when the committed files differ
```

Same input gives the same bytes; CI runs the `--verify` form against a fresh clone of the pin.

## QuickJS compatibility

three.js r186 needs no polyfills on QuickJS 2024-01-13: the minimal fixture (`new THREE.Scene()` plus one `Mesh(BoxGeometry(1, 1, 1))`) loads and runs in the bare engine (see `test/three/quickjs-minimal.test.js`). If a future pin uses a built-in that QuickJS lacks, add the smallest polyfill to `POLYFILLS` in `build.mjs` — the single patching place, never edit the generated bundle — and document here which missing built-in it covers.
