# JSR messaging protocol v0.1

The complete `sendMessage(channel, payload)` channel specification of the JSR
widget runtime, extracted from the reference implementation
`IstiN/flutter_js_widget_runtime` (`lib/src/runtime/js_widget_bridge.dart` +
`js_widget_bootstrap.dart`, pinned by `conformance.lock`).

The code wins over any prose: `test/protocol.test.js` re-parses the pinned
bridge on every run and asserts that every handler-map key is a complete row
of the channel table below.

## 1. Transport

The engine provides one global: `sendMessage(channelName, payloadString)`.
`channelName` is a `__jsr_*` channel from the table; `payloadString` is a JSON
string for object payloads and a plain string for the raw-payload channels
listed in section 2. The bootstrap wraps every send through
`__send(ch, payload)` → `__tag(payload)`:

- Object payloads pass through unchanged (the caller already serialized them).
- Raw string payloads are wrapped as `{"iid":"<__IID>","id":"<payload>"}` so
  the cross-engine router can route them; the router unwraps `{iid, id}` back
  to the raw payload before the bridge handler runs.
- Engines with per-engine isolation (QuickJS) may define `__JSR_RAW_BINARY__`
  and skip the wrapper on the binary channel.

Web Worker engines carry both directions in one envelope: JS→host messages
post `'__jsr__' + JSON.stringify({channel, payload})`; host→JS control
messages (`__jsr_call_event`, `__jsr_updateTheme`, `__jsr_host_event`,
`__jsr_interval_tick`, `__jsr_raf_tick`, `__jsr_resolve`) arrive through
`onmessage`. VM engines deliver host→JS calls by evaluating the globals of
section 6.

## 2. Promise resolution and errors

Async APIs register a callback in `__cbs[id]` under a fresh `__nid()` id and
resolve it through the host-to-JS global `__jsrResolve(id, value)`. The error
value shape is `{"__error": "<message>"}`; a callback that receives it rejects
with `new Error(value.__error)`, any other value resolves the promise.
`value` is whatever the host handler passes to `resolveCallback(id, value)` —
the channel contract fixes only the `__error` convention, not the success
shape. There is no timeout on the JS side; a host that never calls
`resolveCallback` leaves the promise pending forever.

`__nid()` returns `'i' + (++__idCounter)` — a monotonic per-engine counter,
cheaper than `Math.random()`/`Date.now()`.

## 3. Channel table

| Channel | Tier | Direction | Payload schema | Response contract | Error semantics | Dart handler | Wire example |
|---|---|---|---|---|---|---|---|
| `__jsr_log` | core | JS → host | Raw string: the joined console arguments; `console.warn` prefixes `[W] `, `console.error` prefixes `[E] ` | Fire-and-forget; host emits it to the log sink (`onLog`) | None; never rejected or dropped by the bridge | `_handleLog` | `sendMessage('__jsr_log','{"iid":"w1","id":"hello world"}')` |
| `__jsr_render` | core | JS → host | JSON string of the full UI tree object (`{type, props, children, events, ...}`); `jsr.render` stamps `tree.__iid` before serializing and `__tag` adds the routing `iid` | Fire-and-forget; host applies the tree through `onRender`; no ack to JS | Render exceptions are caught and logged host-side; the widget keeps running | `_handleRender` | `sendMessage('__jsr_render','{"iid":"w1","type":"column","children":[...]}')` |
| `__jsr_set_title` | core | JS → host | Raw string: `String(t)` from `jsr.setTitle(t)` | Fire-and-forget; host updates the title via `onSetTitle` | None; empty title is delivered as `''` | `_handleSetTitle` | `sendMessage('__jsr_set_title','{"iid":"w1","id":"Counter"}')` |
| `__jsr_set_interval` | core | JS → host | JSON object `{"id":"<nid>","ms":<number>,"once":true}`; `once:true` marks a `setTimeout` (host fires it once and drops the timer), absent `once` marks a repeating `setInterval` with default `ms` 1000; `setTimeout` defaults `ms` to 0 | Fire-and-forget; the host schedules a timer; ticks arrive through `__jsrInterval(id)` (VM) or `__jsr_interval_tick` (worker) | Re-scheduling an existing id replaces its timer; no error path | `_handleSetInterval` | `sendMessage('__jsr_set_interval','{"id":"i1","ms":250,"once":true}')` |
| `__jsr_clear_interval` | core | JS → host | Raw string: the timer id (`clearTimeout`/`clearInterval`) | Fire-and-forget; unknown ids are ignored host-side | None | `_handleClearInterval` | `sendMessage('__jsr_clear_interval','{"iid":"w1","id":"i1"}')` |
| `__jsr_raf` | core | JS → host | JSON object `{"id":"<nid>","iid":"<__IID>"}` (the only channel that keeps its `iid` through dispatch) | One frame tick per request: the host fires `__jsrRaf(id, elapsedMs)` (VM) or `__jsr_raf_tick` (worker) and the JS callback is deleted; the widget must re-request every frame; the host ticker stops itself after ~1 s idle | None; unknown ids are ignored | `_handleRaf` | `sendMessage('__jsr_raf','{"id":"i3","iid":"w1"}')` |
| `__jsr_caf` | core | JS → host | Raw string: the frame id (`cancelAnimationFrame`) | Fire-and-forget; the host drops the pending frame | None | `_handleCaf` | `sendMessage('__jsr_caf','{"iid":"w1","id":"i3"}')` |
| `__jsr_fetch` | core | JS → host | JSON object `{"id":"<nid>","url":<string>,"method":<string>,"headers":<object>}`; `method` defaults `GET`, `headers` default `{}`; the host uppercases the method | Promise via `__cbs[id]`; the host `fetchHandler` resolves with the response value it defines | Permission gate `fetch` rejects with `fetchJson is disabled in Settings → Apps & Widgets`; handler exceptions resolve `{"__error": ...}` | `_handleFetch` | `sendMessage('__jsr_fetch','{"id":"i4","url":"https://api.example/v1","method":"GET","headers":{}}')` |
| `__jsr_exec` | core | JS → host | JSON object `{"id":"<nid>","cmd":<string>}` (empty `cmd` arrives as `''`) | Promise via `__cbs[id]`; the host `execHandler` resolves with the run result value it defines | Handler exceptions resolve `{"__error": ...}`; hosts may refuse `exec` by capability | `_handleExec` | `sendMessage('__jsr_exec','{"id":"i5","cmd":"ls -l"}')` |
| `__jsr_open_url` | extended | JS → host | JSON object `{"id":"<nid>","url":<string>}` | Promise via `__cbs[id]`; resolves `true` when the external launch was accepted | No host handler rejects `openUrl is not supported by this host`; empty url rejects `openUrl: empty url` | `_handleOpenUrl` | `sendMessage('__jsr_open_url','{"id":"i6","url":"https://example.com"}')` |
| `__jsr_host_call` | core | JS → host | JSON object `{"id":"<nid>","name":<string>,"args":<object>}`; `args` defaults `{}` | Promise via `__cbs[id]`; resolves with the host handler result (empty object when it returns null) | Names `voxel.*`, `three.asset`, `three.canvas2d` are intercepted by the bridge before the host; no host handler rejects `hostCall is not supported by this host`; handler exceptions resolve `{"__error": ...}` | `_handleHostCall` | `sendMessage('__jsr_host_call','{"id":"i7","name":"asr.record","args":{"lang":"en"}}')` |
| `__jsr_host_call_binary` | extended | JS → host | Raw string `"<name> <base64>"` — no JSON body, no promise round trip; on QuickJS with `__JSR_RAW_BINARY__` the string crosses untagged, otherwise it is `{iid, id}`-wrapped and unwrapped by the router | Fire-and-forget and lossy: responses never flow back on this lane; pair it with `__jsr_host_call` for results | Malformed payloads (no space, undecodable base64) are dropped silently; reserved names `audio.synth`, `three.r1`, `voxel.*` are routed by the bridge | `_handleHostCallBinary` | `sendMessage('__jsr_host_call_binary','scene.transforms eyJtIjoxfQ==')` |
| `__jsr_capture` | extended | JS → host | JSON object `{"id":"<nid>","opts":<object>}`; `opts` defaults `{}` | Promise via `__cbs[id]`; the bridge handles the channel fire-and-forget and resolves whenever the host capture completes (`{path, width, height}` where supported) — an awaited capture would starve the event lane | No host handler rejects `capture is not supported by this host`; handler exceptions resolve `{"__error": ...}` | `_handleCapture` | `sendMessage('__jsr_capture','{"id":"i8","opts":{"format":"png"}}')` |
| `__jsr_storage_get` | core | JS → host | JSON object `{"id":"<nid>","key":<string>}` | Promise via `__cbs[id]`; resolves the stored value (or the host's miss value); the JS side caches results per key | Permission gate `storage` rejects `storage is disabled in Settings → Apps & Widgets` | `_handleStorageGet` | `sendMessage('__jsr_storage_get','{"id":"i9","key":"theme"}')` |
| `__jsr_storage_set` | core | JS → host | JSON object `{"key":<string>,"value":any}` (no id — no response) | Fire-and-forget; the host updates its storage map and notifies `storageChanged`; the JS side caches the write immediately | Permission gate `storage` drops the write silently | `_handleStorageSet` | `sendMessage('__jsr_storage_set','{"key":"theme","value":"dark"}')` |
| `__jsr_secrets_get` | core | JS → host | JSON object `{"id":"<nid>","key":<string>}` | Promise via `__cbs[id]`; resolves the secret value or null when missing | Permission gate `secrets` rejects `secrets is disabled in Settings → Apps & Widgets` | `_handleSecretsGet` | `sendMessage('__jsr_secrets_get','{"id":"i10","key":"api_token"}')` |
| `__jsr_secrets_set` | core | JS → host | JSON object `{"id":"<nid>","key":<string>,"value":any}`; `jsr.secrets.delete` sends `value: null` | Promise via `__cbs[id]`; resolves the host's ok boolean | Permission gate `secrets` resolves `false` (not an error) | `_handleSecretsSet` | `sendMessage('__jsr_secrets_set','{"id":"i11","key":"api_token","value":"s3cret"}')` |
| `__jsr_load_asset` | core | JS → host | JSON object `{"id":"<nid>","path":<string>}` (empty path arrives as `''`) | Promise via `__cbs[id]`; resolves with the asset value the host `loadAssetHandler` defines; never rejects — host failures resolve their own error value | Host-defined; a missing handler resolves the host's miss value | `_handleLoadAsset` | `sendMessage('__jsr_load_asset','{"id":"i12","path":"fixtures/data.json"}')` |
| `__jsr_export_state` | core | JS → host | JSON object: the widget's structured state (`jsr.exportState(obj)` serializes `obj`, or `{}` when omitted) | Fire-and-forget; the host stores the snapshot (`exportedState`) for tooling; no ack | Unparseable payloads clear the snapshot; no error to JS | `_handleExportState` | `sendMessage('__jsr_export_state','{"count":1}')` |
| `__jsr_scene3d_command` | extended | JS → host | JSON object `{"kind":<string>,"sceneId":<string>,"payload":<object>}`; kinds: `create`, `destroy`, `setTransforms` (payload `{items:[{modelId, position, rotation, scale}]}`), `addModel`, `removeModel`, `setTransform`, `playAnimation`, `stopAnimation`, `setCamera`, `setLight`; empty `sceneId` is ignored | Fire-and-forget; the host applies the command to its `Js3dHost` controller; no ack | No host drops the command with a log line (no JS-visible error); unknown kinds and unknown scene ids are ignored | `_handleScene3dCommand` | `sendMessage('__jsr_scene3d_command','{"kind":"create","sceneId":"s1","payload":{}}')` |
| `__jsr_event_done` | core | JS → host | JSON object `{}` on success, `{"error":"<message>"}` on handler failure | Completes the host's serialized `callEvent` queue for the current event; the host waits at most 5 s and logs a timeout | Worker engines only (see section 5); VM engines never send it | `_handleEventDone` | `sendMessage('__jsr_event_done','{}')` |

## 4. Issue list versus reference

Issue #1 of this repository listed 17 channels. The reference bridge
implements 21. All 17 issue channels exist in the code; the code adds four
channels the issue did not name:

| Issue #1 list (17) | In the reference code |
|---|---|
| `__jsr_render` | yes |
| `__jsr_set_title` | yes |
| `__jsr_log` | yes |
| `__jsr_set_interval` | yes |
| `__jsr_clear_interval` | yes |
| `__jsr_raf` | yes |
| `__jsr_caf` | yes |
| `__jsr_fetch` | yes |
| `__jsr_exec` | yes |
| `__jsr_host_call` | yes |
| `__jsr_storage_get` | yes |
| `__jsr_storage_set` | yes |
| `__jsr_secrets_get` | yes |
| `__jsr_secrets_set` | yes |
| `__jsr_load_asset` | yes |
| `__jsr_export_state` | yes |
| `__jsr_event_done` | yes |

Channels in the code but not in the issue list: `__jsr_open_url`,
`__jsr_capture`, `__jsr_host_call_binary`, `__jsr_scene3d_command`.

## 5. Channel tiers

- **core** — the 17 issue channels. Every platform implements the host side
  of all core channels.
- **extended** — `__jsr_open_url`, `__jsr_capture`, `__jsr_host_call_binary`,
  `__jsr_scene3d_command`. A platform either implements an extended channel or
  answers `{"__error": "<channel> is not supported by this host"}` (for the
  fire-and-forget lanes it drops the payload instead). A conformance fixture
  that needs an extended channel declares the matching capability in its
  `meta.json`: `openUrl`, `capture`, `binary`, `scene3d`.

`__jsr_event_done` is sent only by a Web Worker engine after
`__jsr_call_event` (the worker invokes `jsr._handler`/`handleEvent` and sends
`{}` when the returned promise settles, `{"error": ...}` when it throws). VM
engines run events inline and never send it.

## 6. Host-to-JS globals

The host drives JS by evaluating these bootstrap globals (VM engines) or the
matching worker control message (worker engines):

| Global (VM) | Worker control message | Signature | Effect |
|---|---|---|---|
| `__jsrResolve(id, value)` | `__jsr_resolve {id, value}` | `(string id, any value)` | Resolves `__cbs[id]`; `{"__error": ...}` rejects the promise |
| `__jsrInterval(id)` | `__jsr_interval_tick "<id>"` | `(string id)` | Fires the interval/timeout callback; one-shot timers delete their callback |
| `__jsrRaf(id, elapsed)` | `__jsr_raf_tick {id, elapsed}` | `(string id, number elapsedMs)` | Fires the animation-frame callback with monotonic elapsed ms; one-shot, callback deleted |
| `__jsrWarmResolve(id, value, size)` | — (QuickJS isolate only) | `(string id, object value, number size)` | Warm-bytes resolve: pulls `size` bytes through the host function `__jsrWarmFill(id, Uint8Array)`, merges them as `value.bytes`, resolves `__cbs[id]` |
| `__jsrHostEvent(target, payload)` | `__jsr_host_event {target, payload}` | `(string target, object payload)` | Fire-and-forget host events; never crosses the bridge channels. Targets: `key` (keyboard), `viewport` (updates `jsr._viewport`), `three.blur`, `three.input:*`, `scene3d.tap:*` (tap picking), `gesture:*` (high-frequency gestures; invokes the event handler without the `__jsr_event_done` round trip) |

Additional host theme path: `updateThemeJs(colors)` evaluates
`jsr.theme=Object.assign(jsr.theme||{}, <colors>); if(jsr._onThemeChange){...}`
(worker: `__jsr_updateTheme`).

QuickJS-only byte lanes (native host functions, not channels):

- `__jsrSendBytes(name, Uint8Array)` — zero-copy send used by
  `jsr.hostCallBinary` for typed arrays.
- `__jsrWarmFill(id, Uint8Array)` — fills the byte buffer pulled by
  `__jsrWarmResolve`.
- `__jsrHostResolveValue` — stashed big resolve value read by the QuickJS
  resolve path before it calls `__jsrResolve(id, __jsrHostResolveValue)`.
- `__JSR_RAW_BINARY__` — marker global of engines with per-engine isolation;
  switches `__jsr_host_call_binary` to the untagged string lane.

`__IID` tags outgoing payloads (`iid` key via `__tag`) so the JSC cross-engine
router can deliver each message to the owning engine; the bridge strips the
tag before handlers run (except `__jsr_raf`, which keeps its explicit `iid`
contract into the handler parse). It never filters incoming host→JS events —
those are delivered to the engine that evaluates them.

## 7. Engine order at start

1. `var __IID = "<instance id>";`
2. optional library preload (`three.min.js`)
3. `bootstrap-runtime.js`
4. `bootstrap-widget.js`
5. the widget code

Every outbound payload is tagged from step 1 onward; the widget code runs
after both bootstrap halves, so `jsr.*` and the host globals exist before the
first widget statement.
