// The overridden audio subsystem must be byte-identical to the pinned
// reference bootstrap: same rendered PCM envelope for deterministic tracks,
// same validation errors. This is the behavior proof for the CRAP splits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { runtimeJs, rootDir } from './helpers.mjs';

const dart = readFileSync(
  join(rootDir, '.conformance', 'flutter_js_widget_runtime', 'lib', 'src', 'runtime', 'js_widget_bootstrap.dart'),
  'utf8',
);
const referenceJs = dart.slice(
  dart.indexOf("= r'''") + "= r'''".length,
  dart.indexOf("''';", dart.indexOf("= r'''") + "= r'''".length),
);

// A fake host around an ARBITRARY bootstrap text (reference or generated),
// with the same seeded RNG for both. Our generated half is evaluated under
// its real file path so V8 coverage attributes it to bootstrap-runtime.js.
function hostWith(bootstrapJs) {
  const calls = [];
  const ctx = { __IID: 'w1', sendMessage: (c, p) => calls.push([c, p]) };
  vm.createContext(ctx);
  vm.runInContext('var s = 42; Math.random = function(){ s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };', ctx);
  vm.runInContext(bootstrapJs, ctx, {
    filename: bootstrapJs === referenceJs ? 'reference' : join(rootDir, 'bootstrap-runtime.js'),
  });
  return {
    ctx,
    run: (code) => vm.runInContext(code, ctx),
    payload: () => calls.filter(([c]) => c === '__jsr_host_call_binary')[0]?.[1] ?? null,
    errors: [],
  };
}

function synthPayloadOf(taggedPayload) {
  // The string lane delivers the __tag wrapper {"iid", "id": "audio.synth <b64>"}.
  return JSON.parse(taggedPayload).id;
}

function renderFixture(bootstrapJs, setup) {
  const h = hostWith(bootstrapJs);
  const done = h.run(setup);
  if (done && typeof done.catch === 'function') {
    done.catch((e) => h.errors.push(e.message));
  }
  return { h, payload: h.payload(), errors: h.errors };
}

const baseFixture = readFileSync(join(rootDir, 'fixtures', 'audio.fixture.js'), 'utf8');

test('the rendered envelope is byte-identical to the reference bootstrap', () => {
  const ref = renderFixture(referenceJs, baseFixture);
  const ours = renderFixture(runtimeJs, baseFixture);
  assert.equal(synthPayloadOf(ours.payload), synthPayloadOf(ref.payload));
  assert.ok(synthPayloadOf(ref.payload).startsWith('audio.synth '));
  assert.deepEqual(ours.errors, []);
});

test('stereo rendering with drive matches the reference byte for byte', () => {
  const setup = `jsr.audio.synth({ sampleRate: 44100, channels: 2, duration: 0.01 })
    .osc({ type: 'sine', frequency: 440, duration: 0.008, pan: -0.5, drive: 3 })
    .render()`;
  assert.equal(renderFixture(runtimeJs, setup).payload, renderFixture(referenceJs, setup).payload);
});

test('noise, biquad filter and tremolo match under the seeded RNG', () => {
  const setup = `
    jsr.audio.synth({ sampleRate: 8000, channels: 1, duration: 0.02 })
      .osc({ type: 'noise', noiseColor: 'pink', duration: 0.015 })
      .osc({ type: 'noise', noiseColor: 'brown', start: 0.005, duration: 0.01 })
      .osc({ type: 'sine', frequency: 440, duration: 0.01, filter: { type: 'highpass', frequency: 300, q: 4 }, tremolo: { rate: 9, depth: 0.6 } })
      .render()`;
  assert.equal(renderFixture(runtimeJs, setup).payload, renderFixture(referenceJs, setup).payload);
});

test('delay and reverb effect tails match the reference', () => {
  const setup = `
    jsr.audio.synth({ sampleRate: 8000, channels: 1, duration: 0.03, effects: [
      { type: 'delay', time: 0.01, feedback: 0.5, mix: 0.4 },
      { type: 'reverb', decay: 0.3, mix: 0.5 },
    ] })
    .osc({ type: 'sawtooth', frequency: 110, duration: 0.02 })
    .render()`;
  assert.equal(renderFixture(runtimeJs, setup).payload, renderFixture(referenceJs, setup).payload);
});

test('the envelope carries the JSRA header: magic, version, json header, f32 pcm', () => {
  const { payload } = renderFixture(runtimeJs, baseFixture);
  const bytes = Buffer.from(synthPayloadOf(payload).slice('audio.synth '.length), 'base64');
  assert.deepEqual([...bytes.subarray(0, 4)], [0x4a, 0x52, 0x52, 0x41]); // 'JRRA' (code bytes; the reference comment says 'JSRA' — the code wins)
  assert.equal(bytes.readUint32LE(4), 1); // version
  const headerLen = bytes.readUint32LE(8);
  const header = JSON.parse(bytes.subarray(12, 12 + headerLen).toString('utf8'));
  assert.deepEqual(header, { id: 'i1', name: 'synth-1', sampleRate: 8000, channels: 1, frames: 160 }); // unnamed tracks get synth-<counter>
  const pad = (4 - (headerLen % 4)) % 4;
  assert.equal(bytes.length, 12 + headerLen + pad + 160 * 1 * 4);
});

test('note frequencies and validation errors match the reference', () => {
  const ours = hostWith(runtimeJs);
  const ref = hostWith(referenceJs);
  const scripts = [
    `jsr.audio.noteToFrequency('a4')`,
    `jsr.audio.noteToFrequency('c#3')`,
    `jsr.audio.noteToFrequency('Bb2')`,
    `jsr.audio.noteToFrequency(440)`,
    `jsr.audio.noteToFrequency(0)`,
    `jsr.audio.noteToFrequency('h')`,
    `jsr.audio.noteToFrequency('c9')`,
  ];
  for (const script of scripts) {
    let a; let b;
    try { a = String(ours.run(script)); } catch (e) { a = e.message; }
    try { b = String(ref.run(script)); } catch (e) { b = e.message; }
    assert.equal(a, b, script);
  }
  assert.equal(ours.run(`jsr.audio.noteToFrequency('a4')`), 440);
});

test('osc validation errors match the reference exactly', () => {
  const ours = hostWith(runtimeJs);
  const ref = hostWith(referenceJs);
  const scripts = [
    `jsr.audio.synth({}).osc({ type: 'flute' })`,
    `jsr.audio.synth({}).osc({ type: 'sine' })`,
    `jsr.audio.synth({}).osc({ type: 'noise', noiseColor: 'mauve' })`,
    `jsr.audio.synth({}).osc({ type: 'sine', frequency: 440, noiseColor: 'white' })`,
    `jsr.audio.synth({}).osc({ type: 'sine', frequency: 440, fm: { modFrequency: 3 } })`,
    `jsr.audio.synth({}).osc({ type: 'sine', frequency: 440, filter: { type: 'bandstop' } })`,
    `jsr.audio.synth({}).osc({ type: 'sine', frequency: 440, vibrato: 5 })`,
    `jsr.audio.synth({}).osc({ type: 'sine', frequency: 440, effects: [{ type: 'chorus' }] })`,
    `jsr.audio.synth({ duration: 200 }).osc({ type: 'sine', frequency: 440 }).render()`,
    `jsr.audio.synth({}).osc({ type: 'sine', frequency: 440, start: 5 }).render()`,
  ];
  for (const script of scripts) {
    let a; let b;
    try { ours.run(script); a = 'no-sync-throw'; } catch (e) { a = e.message; }
    try { ref.run(script); b = 'no-sync-throw'; } catch (e) { b = e.message; }
    assert.equal(a, b, script);
  }
});

test('render rejects when the track has no events (async, like the reference)', async () => {
  const ours = renderFixture(runtimeJs, `jsr.audio.synth({}).render()`);
  const ref = renderFixture(referenceJs, `jsr.audio.synth({}).render()`);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(ours.errors, ['audio.synth: track has no osc/note events']);
  assert.deepEqual(ref.errors, ['audio.synth: track has no osc/note events']);
});

test('note() derives the frequency from the note name and renders like osc()', () => {
  const ours = hostWith(runtimeJs);
  assert.equal(ours.run(`jsr.audio.synth({}).note('a4') instanceof __JsAudioSynth`), true);
  assert.equal(ours.run(`jsr.audio.synth({}).note('a4').events[0].frequency`), 440);
  assert.equal(ours.run(`jsr.audio.synth({}).note('a4').events[0].duration`), 0.25);
  assert.equal(
    ours.run(`jsr.audio.synth({}).note('a4', { frequency: 999, type: 'square' }).events[0].frequency`),
    999,
  );
});

test('render rejects when events extend beyond the 120 s ceiling', async () => {
  const ours = renderFixture(
    runtimeJs,
    `jsr.audio.synth({}).osc({ type: 'sine', frequency: 440, start: 119, duration: 2 }).render()`,
  );
  const ref = renderFixture(
    referenceJs,
    `jsr.audio.synth({}).osc({ type: 'sine', frequency: 440, start: 119, duration: 2 }).render()`,
  );
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(ours.errors, ['audio.synth: rendered duration must be 0..120 seconds']);
  assert.deepEqual(ref.errors, ['audio.synth: rendered duration must be 0..120 seconds']);
});
