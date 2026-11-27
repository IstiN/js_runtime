# js_runtime

Engine-agnostic JavaScript runtime core for jsr widgets — the platform-neutral
layer beneath every `*_js_widget_runtime` renderer (Flutter, Android, iOS,
macOS, web).

Contract sibling: [js_widget_runtime](https://github.com/IstiN/js_widget_runtime)
(the UI contract). Reference renderer:
[flutter_js_widget_runtime](https://github.com/IstiN/flutter_js_widget_runtime).

## Scope

- **Engines**: QuickJS (C, vendored, builds for armeabi-v7a/arm64/x86_64),
  JavaScriptCore (iOS/macOS), Web Worker (browser). One messaging contract
  above all of them.
- **Messaging protocol**: the `sendMessage(channel, payloadJson)` bridge and
  the full `__jsr_*` channel list (21 channels: 17 core + 4 extended —
  openUrl, capture, hostCallBinary, scene3d; see `docs/PROTOCOL.md` §5) —
  payload JSON shapes, direction, response contract.
- **Runtime bootstrap** (JS side): `console`, `setTimeout/setInterval`,
  `requestAnimationFrame`, `fetchJson`, `exec`, `storage`, `secrets`,
  `loadAsset`, `hostCall`, `exportState`.
- **Host contracts**: `JsMediaHost`, `JsWebViewHost`, `Js3dHost` — interfaces
  the embedding app implements.
- **Injectable JS libraries**: vendored builds (three.js et al) loadable into
  the engine without touching widget code.

## Non-scope

- UI node schema / rendering — see js_widget_runtime.
- Per-platform embedding glue — see the platform repos.

## Engines

The vendored QuickJS 2024-01-13 lives in `engines/quickjs/`; the adapter
interface is `docs/ENGINE_ADAPTER.md`.

```bash
bash tool/build_all.sh host                 # build/host/libquickjs.a + build/host/qjs_harness
bash tool/build_all.sh --ndk "$ANDROID_NDK_HOME" armeabi-v7a arm64-v8a x86_64
                                            # build/<abi>/libquickjs.a per Android ABI
```

Android targets need an NDK (`$ANDROID_NDK_HOME` or `--ndk <dir>`; CI installs
`ndk;27.2.12479018`). `npm test` builds the host backend itself when
`build/host/qjs_harness` is missing.

## three.js

`libs/three/` vendors the three.js r186 bundle (`three.min.js`,
reproducible via `node libs/three/build.mjs --source <checkout> --verify`)
plus `three-shim.js` (a `document.createElement('canvas')` stub that exists
only when `document` is undefined and defers to the host's
`__jsrCreateCanvas`). The host preloads the bundle before the bootstrap; see
`libs/three/docs/THREE.md`. Parity (Chromium == QuickJS) runs with
`JSR_REQUIRE_BROWSER=1 node --test test/three/*.test.js`.

## Docs

- `docs/PROTOCOL.md` — messaging channel specification (extracted from the
  Flutter reference implementation).
- `docs/ENGINE_ADAPTER.md` — the engine adapter interface.
- `docs/BOOTSTRAP.md` — the runtime bootstrap half, its generator and the
  CRAP overrides.

## Running tests

Requires Node >= 20.

```bash
npm ci
npm test
```

## Quality gate

CRAP-4 gate (threshold 8.0) plus coverage, computed on first-party source:

```bash
npm run coverage   # c8: coverage/coverage-final.json + text summary
npm run crap       # crap4js against the coverage file
```
