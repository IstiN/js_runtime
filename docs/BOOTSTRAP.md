# The runtime bootstrap half (`bootstrap-runtime.js`)

The runtime half of the JSR bootstrap: `console`, timers, animation frames,
the `performance` shim, the promise/timer/rAF callback registries and the 13
host-service members of the `jsr` API. The widget half (rendering, events,
theme, viewport, easing) belongs to `IstiN/js_widget_runtime` and is NOT part
of this repository.

Source of truth: the pinned `kJsWidgetBootstrap`
(`.conformance/flutter_js_widget_runtime/lib/src/runtime/js_widget_bootstrap.dart`).
Wire facts per channel are in `docs/PROTOCOL.md`.

## Generator contract (`scripts/extract_bootstrap.mjs`)

```
node scripts/extract_bootstrap.mjs                     # write bootstrap-runtime.js
node scripts/extract_bootstrap.mjs --emit-widget <p>   # write the widget half to <p>
node scripts/extract_bootstrap.mjs --check             # exit 1 on drift with the committed file
```

- Reads the pinned reference through `conformance.lock` (run
  `scripts/fetch-conformance.sh` first; the generator and `--check` need
  `.conformance/flutter_js_widget_runtime/...` to exist).
- **Split rule** (plan 1.2): the runtime half is the explicit RUNTIME set —
  the top-level statements `__cbs`, `__iv_cbs`, `__raf_cbs`, `__jsrResolve`,
  `__jsrInterval`, `__jsrRaf`, `__jsrWarmResolve`, `__tag`, `__send`,
  `__idCounter`, `__nid`, `__joinArgs`, `__timers`, `console`, `setTimeout`,
  `clearTimeout`, `setInterval`, `clearInterval`, `requestAnimationFrame`,
  `cancelAnimationFrame`, the `performance` shim, the audio synth internals
  (`__jsrAudio*`, `__JsAudioSynth*` — required by the `jsr.audio` member) and
  `var jsr` filtered to the 13 runtime members (`audio`, `fetchJson`, `exec`,
  `hostCall`, `hostCallBinary`, `b64encode`, `capture`, `storage`,
  `exportState`, `openUrl`, `secrets`, `loadAsset`, `scene3d`). Everything
  else is the widget half in reference order: `Object.assign(jsr, { ...19
  members... });` (first line of the emitted widget file) plus the
  widget-only top-level statements (`jsr.ease.*` aliases, `__jsrHostEvent`).
- Statement text is copied verbatim; the only structural change is the split
  of the one `jsr` literal into two definitions. The generated runtime file
  carries a provenance header naming the pin.
- `jsr_runtime` does not commit the widget half; `--emit-widget` exists so
  `IstiN/js_widget_runtime` (W1) can generate it with this exact script.

## CRAP overrides (`tool/bootstrap-overrides/`)

The CRAP gate (threshold 8.0) forbids hand-editing the generated file.
Restructuring happens through named overrides: a file
`<target>.js` in `tool/bootstrap-overrides/` replaces a top-level statement
(`function X` / `var X` / `X = ...`) or one `jsr` member (`jsr.<member>.js`).
Text after a `// jsr-append-top-level` marker is appended to the runtime half
as new top-level statements (the helpers each split needs). Every override is
verified byte-equivalent against the reference by `test/bootstrap/audio.test.js`
(rendered PCM envelopes and validation errors) and the group tests.

| Override file | Replaces | Reference CC | Reason |
|---|---|---|---|
| `jsr.b64encode.js` | `jsr.b64encode` | 16 | encoder split into pair table, full quads, tail and chunked output (`__b64PairTable`, `__b64Quads`, `__b64FullQuads`, `__b64Tail`, `__b64String`) |
| `jsr.hostCallBinary.js` | `jsr.hostCallBinary` | 9 | string lane moved to `__jsrSendBinaryString`; member keeps the native bytes-lane detection |
| `__jsrAudioNoteFrequency.js` | `__jsrAudioNoteFrequency` | 13 | numeric path (`__jsrAudioFreqHz`) and accidentals (`__jsrAudioSemitones`) split out |
| `__jsrAudioEffects.js` | `__jsrAudioEffects` | 11 | per-effect validation (`__jsrAudioEffect`, `__jsrAudioDelayEffect`, `__jsrAudioReverbEffect`) |
| `__jsrAudioFilter.js` | `__jsrAudioFilter` | 8 | optional-field handling via `__jsrAudioOptionalNumber` |
| `__jsrAudioApplyReverb.js` | `__jsrAudioApplyReverb` | 8 | comb-bank setup (`__jsrAudioReverbBanks`) and per-frame processing (`__jsrAudioReverbFrame`) split |
| `__JsAudioSynth.prototype.osc.js` | `__JsAudioSynth.prototype.osc` | 17 | type/frequency/noiseColor validation split (`__jsrAudioOscType`, `__jsrAudioOscFrequency`, `__jsrAudioOscNoiseColor`) |
| `__JsAudioSynth.prototype.render.js` | `__JsAudioSynth.prototype.render` | 62 | render chain split into track length, PCM allocation, per-event fill and per-sample helpers (envelope, vibrato, FM, noise, oscillator, biquad filter, drive, tremolo, mix) driven by a per-event state object |

Everything else of the reference stays byte-identical.

## Runtime API reference

Signatures and wire examples are normative in `docs/PROTOCOL.md`; the tables
below map each API to its channel.

| API | Channel | Notes |
|---|---|---|
| `console.log/warn/error/info/debug(...)` | `__jsr_log` | arguments joined with spaces; `[W] `/`[E] ` prefixes |
| `console.time(l)` / `console.timeEnd(l)` | `__jsr_log` | logs `l: <ms>ms`; unknown label is silent |
| `setTimeout(fn, ms)` | `__jsr_set_interval` | `{"id","ms":ms or 0,"once":true}`; id from `__nid()` |
| `setInterval(fn, ms)` | `__jsr_set_interval` | `{"id","ms":ms or 1000}` |
| `clearTimeout(id)` / `clearInterval(id)` | `__jsr_clear_interval` | raw id, `{iid, id}`-wrapped |
| `requestAnimationFrame(fn)` | `__jsr_raf` | `{"id","iid"}`; tick via `__jsrRaf(id, elapsed)`, one-shot |
| `cancelAnimationFrame(id)` | `__jsr_caf` | raw id |
| `jsr.fetchJson(url, opts)` | `__jsr_fetch` | `{id, url, method or GET, headers or {}}`; rejects on `{__error}` |
| `jsr.exec(cmd)` | `__jsr_exec` | `{id, cmd}` |
| `jsr.openUrl(url)` | `__jsr_open_url` | `{id, url: String(url)}`; resolves true when launched |
| `jsr.hostCall(name, args)` | `__jsr_host_call` | `{id, name, args or {}}` |
| `jsr.hostCallBinary(name, data)` | `__jsr_host_call_binary` | `"<name> <base64>"`; native `__jsrSendBytes` lane for typed arrays; untagged when `__JSR_RAW_BINARY__` is defined |
| `jsr.b64encode(data)` | — (pure) | byte image of typed arrays/views; RFC 4648 output |
| `jsr.capture(opts)` | `__jsr_capture` | `{id, opts or {}}`; bridge resolves whenever the capture finishes |
| `jsr.storage.get(key)` / `.set(key, v)` | `__jsr_storage_get` / `__jsr_storage_set` | get `{id, key}` + JS-side cache; set `{key, value}` without id |
| `jsr.secrets.get/set/delete` | `__jsr_secrets_get` / `__jsr_secrets_set` | delete = set with `value: null` |
| `jsr.loadAsset(path)` | `__jsr_load_asset` | `{id, path}`; never rejects — host failures resolve their own value |
| `jsr.exportState(obj)` | `__jsr_export_state` | the object itself, no id |
| `jsr.scene3d.*` | `__jsr_scene3d_command` | `{kind, sceneId, payload}`; kinds per PROTOCOL |
| `jsr.audio.synth(...)` | `__jsr_host_call_binary` | `audio.synth <JRRA envelope>`; offline PCM render |
| `jsr.audio.noteToFrequency(note)` | — (pure) | note names or Hz |

Host-to-JS globals (`__jsrResolve`, `__jsrInterval`, `__jsrRaf`,
`__jsrWarmResolve`, `__jsrHostEvent`) and the `performance` shim are
documented with signatures in `docs/PROTOCOL.md` sections 6–7.

## Tests

- `test/bootstrap/*.test.js` — Node `vm` contexts with a recording fake host
  (`test/bootstrap/helpers.mjs`); one file per API group. The host side is
  simulated by calling the host-to-JS globals directly.
- `test/runtime-half.test.js` — the channel sweep: every runtime API emits
  exactly its documented channel; cross-checked against `docs/PROTOCOL.md`.
- `test/engine/runner.test.js` — the same fixtures
  (`fixtures/*.fixture.js`) through the bare QuickJS engine
  (`build/host/qjs_harness --iid ... --preload bootstrap-runtime.js --script
  <fixture>`); the QuickJS channel trace must equal the vm trace.
- `test/bootstrap/audio.test.js` — the CRAP-override behavior proof: rendered
  PCM envelopes and validation errors are byte/message-identical to the
  pinned reference bootstrap.
