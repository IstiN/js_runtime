// Every runtime API sends the documented channel payload: this sweep drives
// all 18 channels reachable from the runtime half and cross-checks the
// channel list against docs/PROTOCOL.md. (__jsr_render and __jsr_set_title
// are widget-half members; __jsr_event_done is sent only by Web Worker
// engines — neither may appear here.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRuntime, rootDir } from './bootstrap/helpers.mjs';

const protocol = readFileSync(join(rootDir, 'docs', 'PROTOCOL.md'), 'utf8');
const documented = new Set([...protocol.matchAll(/\| `(__jsr_[a-z0-9_]+)` /g)].map((m) => m[1]));

const RUNTIME_CHANNELS = [
  '__jsr_log',
  '__jsr_set_interval',
  '__jsr_clear_interval',
  '__jsr_raf',
  '__jsr_caf',
  '__jsr_fetch',
  '__jsr_exec',
  '__jsr_host_call',
  '__jsr_storage_get',
  '__jsr_storage_set',
  '__jsr_secrets_get',
  '__jsr_secrets_set',
  '__jsr_load_asset',
  '__jsr_export_state',
  '__jsr_open_url',
  '__jsr_capture',
  '__jsr_host_call_binary',
  '__jsr_scene3d_command',
];

test('docs/PROTOCOL.md documents every runtime channel', () => {
  for (const channel of RUNTIME_CHANNELS) {
    assert.ok(documented.has(channel), `${channel} missing from docs/PROTOCOL.md`);
  }
});

test('driving every runtime API emits exactly its documented channel', () => {
  const h = loadRuntime();
  h.run(`
    console.log('x');
    setTimeout(function(){}, 1);
    clearTimeout('i1');
    requestAnimationFrame(function(){});
    cancelAnimationFrame('i2');
    jsr.fetchJson('http://h');
    jsr.exec('c');
    jsr.hostCall('n');
    jsr.storage.get('k');
    jsr.storage.set('k', 'v');
    jsr.secrets.get('k');
    jsr.secrets.set('k', 'v');
    jsr.loadAsset('p');
    jsr.exportState({});
    jsr.openUrl('http://h');
    jsr.capture();
    jsr.hostCallBinary('lane', new Uint8Array([1]));
    jsr.scene3d.create('s', {});
  `);
  const emitted = new Set(h.trace().map((line) => line.split('\t')[0]));
  for (const channel of RUNTIME_CHANNELS) {
    assert.ok(emitted.has(channel), `${channel} not emitted by its API`);
  }
  assert.ok(!emitted.has('__jsr_render'), 'render is a widget-half member');
  assert.ok(!emitted.has('__jsr_set_title'), 'set_title is a widget-half member');
  assert.ok(!emitted.has('__jsr_event_done'), 'event_done is sent only by worker engines');
  assert.equal(emitted.size, RUNTIME_CHANNELS.length);
});

test('the wire examples of docs/PROTOCOL.md use the payload shapes the runtime sends', () => {
  // Cross-check three documented wire examples against live payloads. The
  // wire adds the __IID routing tag; the documented payload schema is the
  // tagged-stripped shape the bridge hands its handlers.
  const h = loadRuntime();
  h.run(`jsr.fetchJson('https://api.example/v1')`);
  h.run(`jsr.exportState({ count: 1 })`);
  h.run(`jsr.scene3d.create('s1', {})`);
  const untag = (p) => { const o = JSON.parse(p); delete o.iid; return o; };
  assert.deepEqual(untag(h.channelCalls('__jsr_fetch')[0]), {
    id: 'i1',
    url: 'https://api.example/v1',
    method: 'GET',
    headers: {},
  });
  assert.deepEqual(untag(h.channelCalls('__jsr_export_state')[0]), { count: 1 });
  assert.deepEqual(untag(h.channelCalls('__jsr_scene3d_command')[0]), {
    kind: 'create',
    sceneId: 's1',
    payload: {},
  });
});

test('host-to-JS globals resolve, tick and fire exactly as documented', async () => {
  const h = loadRuntime();
  h.run(`
    globalThis.seen = [];
    jsr.fetchJson('http://h').then(function (v) { globalThis.seen.push(v); });
    setInterval(function () { globalThis.seen.push('interval'); }, 5);
    setTimeout(function () { globalThis.seen.push('timeout'); }, 5);
    requestAnimationFrame(function (dt) { globalThis.seen.push(dt); });
  `);
  h.run(`__jsrResolve('i1', 42)`);
  h.run(`__jsrInterval('i2')`);
  h.run(`__jsrInterval('i3')`);
  h.run(`__jsrRaf('i4', 7)`);
  // promise reactions are microtasks; yield the queue before asserting
  await new Promise((r) => setTimeout(r, 0));
  const seen = JSON.parse(h.run('JSON.stringify(globalThis.seen)'));
  assert.ok(seen.includes(42), 'fetch promise resolved with 42');
  assert.deepEqual(seen.filter((x) => typeof x === 'string').sort(), ['interval', 'timeout']);
  assert.ok(seen.includes(7), 'raf fired with elapsed 7');
});
