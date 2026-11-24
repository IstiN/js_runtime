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
  the full `__jsr_*` channel list (17 channels: render, setTitle, log,
  timers, rAF, fetch, exec, hostCall, storage, secrets, loadAsset,
  exportState, eventDone) — payload JSON shapes, direction, response contract.
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

## Docs

- `docs/PROTOCOL.md` — messaging channel specification (extracted from the
  Flutter reference implementation).
