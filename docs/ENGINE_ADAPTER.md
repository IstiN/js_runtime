# Engine adapter interface

One interface, five operations and five host-to-JS helpers, so that every JS
engine backend plugs in without widget-code changes. Backends:

- **QuickJS** — the vendored engine in `engines/quickjs/` (built by
  `tool/build_all.sh`; `tool/qjs_harness.c` is the bare host backend used by
  the tests).
- **JavaScriptCore** — iOS and macOS (the apple repository).
- **Web Worker** — the web platform (the flutter web worker backend today;
  the react repository implements the same interface later).

## Operations

| Operation | Semantics |
|---|---|
| `create({ memoryLimitBytes, maxStackSizeBytes, iid }) -> Engine` | Creates the engine. Sets the JS global `__IID` to `iid` (string) before any code runs. Applies the memory and stack limits when the engine supports them. |
| `eval(code, sourceName) -> { ok, error? }` | Evaluates `code` as global code under `sourceName`. After a successful evaluation it drains pending jobs once (microtasks/promises). On failure returns `{ ok: false, error }` with the exception text; the engine keeps running. |
| `dispose()` | Frees the engine. No callbacks fire after `dispose()`. |
| `setMessageCallback((channel, payload) -> void)` | Installs the JS global `sendMessage(channel, payload)`. Every call forwards `(channel, payload)` to the host callback; the return value is ignored. |
| `executePendingJobs()` | Drains pending jobs until none is left. A no-op on engines that drain by themselves (JavaScriptCore, Web Worker). |

When the host evaluates a dispatch fragment (`callEvent` and the other helpers), every interpolated value — the `actionId` and the `payloadJson` — must be JSON-quoted into the fragment (`jsr._handler("inc", {"delta":1})`), never string-interpolated raw: an unquoted identifier throws a ReferenceError inside the event wrapper's try/catch, the wrapper swallows it, and the tap silently does nothing (device-verified in the Android POC).

## Host-to-JS helpers

| Helper | JS global it invokes |
|---|---|
| `callEvent(actionId, payloadJson)` | `jsr._handler(actionId, payloadJson)` through the event wrapper; a returned promise is not awaited; `__jsr_event_done` is sent by Web Worker engines only. |
| `resolveCallback(id, value)` | `__jsrResolve(id, value)` |
| `intervalTick(id)` | `__jsrInterval(id)` |
| `rafTick(id, elapsed)` | `__jsrRaf(id, elapsed)` |
| `hostEvent(target, payload)` | `__jsrHostEvent(target, payload)` |

## Reference implementations

| Operation / helper | Android (`quickjs_jni.c`, `JsWidgetRuntime.kt`) | Apple (`JsWidgetRuntime.swift`) | Web Worker (`js_widget_engine_web_worker.dart`) |
|---|---|---|---|
| `create` | `nativeCreate`: `JS_NewRuntime` + `JS_SetMemoryLimit` (64 MiB) + `JS_SetMaxStackSize` (512 KiB) + `JS_NewContext`; the Kotlin side holds the `jlong` handle | `JSContext()` created in `JsWidgetRuntime` init | the worker bootstrap string installs `__IID` and the globals on `self` |
| `eval` | `nativeEval`: `JS_Eval(..., JS_EVAL_TYPE_GLOBAL)` with source `<widget>`; on success drains once via `JS_ExecutePendingJob(rt, &pctx)` (never a NULL `pctx`); returns the error string or `null` | `context.evaluateScript(code)`; JavaScriptCore drains by itself | a `__jsr_eval`-style control message evaluated on the worker thread; it drains by itself |
| `dispose` | `nativeDispose`: `JS_FreeContext`, `JS_FreeRuntime`, release of the JNI global ref | releasing the `JSContext` | `worker.terminate()` |
| `setMessageCallback` | C function `js_sendMessage` is registered as the global `sendMessage`; it forwards to Kotlin `onJsMessage(channel, payload)` over JNI | `context.setObject(bridge, "sendMessage")` | the worker `sendMessage` posts `'__jsr__' + JSON.stringify({channel, payload})` to the main thread |
| `executePendingJobs` | the `JS_ExecutePendingJob(rt, &pctx)` drain after each eval | no-op (JavaScriptCore drains by itself) | no-op (the worker drains by itself) |
| `callEvent` | `nativeCallEvent`: evals the `jsr._handler(actionId, payload)` wrapper with source `<event>` and drains; `actionId` and `payload` are JSON-quoted into the fragment — interpolated raw, an unquoted `actionId` throws a ReferenceError the wrapper swallows and the event does nothing | `evaluateScript` of the same wrapper on the `JSContext` | `__jsr_call_event` control message; the worker sends `__jsr_event_done` after the handler settles |
| `resolveCallback` / `intervalTick` / `rafTick` / `hostEvent` | Kotlin `eval`s the matching `__jsrResolve` / `__jsrInterval` / `__jsrRaf` global (timers are scheduled by `JsWidgetRuntime.kt` on `Handler`/`Choreographer`) | `evaluateScript` of the same globals on the main run loop | `__jsr_resolve` / `__jsr_interval_tick` / `__jsr_raf_tick` / `__jsr_host_event` control messages; the main thread drives timers and animation frames |

The react repository implements the same interface later with a `Worker`
engine (`src/engine/WorkerEngine.js`); the widget code does not change.
