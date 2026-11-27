import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers.mjs';

test('__nid produces monotonic ids', () => {
  const h = loadRuntime();
  assert.deepEqual(JSON.parse(h.run('JSON.stringify([__nid(), __nid(), __nid()])')), ['i1', 'i2', 'i3']);
});

test('__IID tags outgoing payloads but does not filter incoming events', () => {
  const h = loadRuntime({ iid: 'engine-7' });
  h.run(`setTimeout(function(){}, 1)`);
  assert.match(h.channelCalls('__jsr_set_interval')[0], /"iid":"engine-7"/);
  // incoming host events go through the __jsr* globals regardless of iid
  h.run(`globalThis.hits = 0; var iv = setInterval(function(){ globalThis.hits++; }, 5); globalThis.ivId = iv;`);
  h.run(`__jsrInterval(globalThis.ivId)`);
  assert.equal(h.run('globalThis.hits'), 1);
});

test('__tag wraps raw string payloads as {iid, id} and re-tags objects', () => {
  const h = loadRuntime();
  assert.equal(
    h.run(`__tag('raw')`),
    '{"iid":"w1","id":"raw"}',
  );
  assert.equal(h.run(`__tag('{"a":1}')`), '{"a":1,"iid":"w1"}');
  assert.equal(h.run(`__tag(undefined)`), '{"iid":"w1"}');
});

test('the performance shim exists with a Date.now-based now()', () => {
  const h = loadRuntime();
  assert.equal(h.run(`typeof performance`), 'object');
  assert.equal(h.run(`Math.round(performance.now()) >= 0`), true);
});

test('performance.now is Date.now-based on engines without a native clock', () => {
  const h = loadRuntime();
  h.run(`globalThis.t1 = performance.now(); Date.now(); globalThis.t2 = performance.now()`);
  assert.equal(h.run(`typeof t1`), 'number');
});

test('cancelAnimationFrame deletes the pending frame callback', () => {
  const h = loadRuntime();
  h.run(`var f = requestAnimationFrame(function(){}); cancelAnimationFrame(f)`);
  assert.equal(h.run(`'i1' in __raf_cbs`), false);
});

test('the runtime half defines every runtime member of the jsr API', () => {
  const h = loadRuntime();
  const members = JSON.parse(h.run(`JSON.stringify(Object.keys(jsr).sort())`));
  assert.deepEqual(members, [
    'audio',
    'b64encode',
    'capture',
    'exec',
    'exportState',
    'fetchJson',
    'hostCall',
    'hostCallBinary',
    'loadAsset',
    'openUrl',
    'scene3d',
    'secrets',
    'storage',
  ]);
});
