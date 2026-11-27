import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers.mjs';

test('storage.get sends {id, key} and caches the value per key', async () => {
  const h = loadRuntime();
  const p = h.run(`jsr.storage.get('theme')`);
  assert.deepEqual(h.channelCalls('__jsr_storage_get'), ['{"id":"i1","key":"theme","iid":"w1"}']);
  h.run(`__jsrResolve('i1', 'dark')`);
  assert.equal(await p, 'dark');
  // second read is served from the JS cache: no second message
  const v = await h.run(`jsr.storage.get('theme')`);
  assert.equal(h.channelCalls('__jsr_storage_get').length, 1);
  assert.equal(v, 'dark');
});

test('storage.set writes {key, value} without an id and updates the cache', () => {
  const h = loadRuntime();
  h.run(`jsr.storage.set('theme', 'dark')`);
  assert.deepEqual(h.channelCalls('__jsr_storage_set'), ['{"key":"theme","value":"dark","iid":"w1"}']);
  assert.equal(h.run(`jsr.storage._c['theme']`), 'dark');
  assert.equal(h.run(`'i1' in __cbs`), false); // no promise round trip
});

test('secrets.get sends {id, key}; secrets.set sends {id, key, value}', () => {
  const h = loadRuntime();
  h.run(`jsr.secrets.get('token')`);
  h.run(`jsr.secrets.set('token', 's3cret')`);
  assert.deepEqual(h.channelCalls('__jsr_secrets_get'), ['{"id":"i1","key":"token","iid":"w1"}']);
  assert.deepEqual(h.channelCalls('__jsr_secrets_set'), ['{"id":"i2","key":"token","value":"s3cret","iid":"w1"}']);
});

test('secrets.delete is secrets.set with value null', () => {
  const h = loadRuntime();
  h.run(`jsr.secrets.delete('token')`);
  assert.deepEqual(h.channelCalls('__jsr_secrets_set'), ['{"id":"i1","key":"token","value":null,"iid":"w1"}']);
});

test('secrets set resolves with the host ok boolean', async () => {
  const h = loadRuntime();
  const p = h.run(`jsr.secrets.set('k', 'v')`);
  h.run(`__jsrResolve('i1', true)`);
  assert.equal(await p, true);
});

test('exportState sends the object itself without an id', () => {
  const h = loadRuntime();
  h.run(`jsr.exportState({ count: 1 })`);
  h.run(`jsr.exportState()`);
  assert.deepEqual(h.channelCalls('__jsr_export_state'), ['{"count":1,"iid":"w1"}', '{"iid":"w1"}']);
});

test('scene3d sends {kind, sceneId, payload} with payload defaulting to {}', () => {
  const h = loadRuntime();
  h.run(`jsr.scene3d.create('s1', { fov: 60 })`);
  h.run(`jsr.scene3d.destroy('s1')`);
  h.run(`jsr.scene3d.setTransform('s1', 'm1', { position: [1, 2, 3] })`);
  h.run(`jsr.scene3d.setTransforms('s1', [{ modelId: 'm1' }])`);
  h.run(`jsr.scene3d.playAnimation('s1', 'm1', 'walk')`);
  h.run(`jsr.scene3d.stopAnimation('s1', 'm1')`);
  h.run(`jsr.scene3d.setCamera('s1', { position: [0, 0, 5] })`);
  h.run(`jsr.scene3d.setLight('s1', { intensity: 2 })`);
  assert.deepEqual(h.channelCalls('__jsr_scene3d_command'), [
    '{"kind":"create","sceneId":"s1","payload":{"fov":60},"iid":"w1"}',
    '{"kind":"destroy","sceneId":"s1","payload":{},"iid":"w1"}',
    '{"kind":"setTransform","sceneId":"s1","payload":{"modelId":"m1","position":[1,2,3]},"iid":"w1"}',
    '{"kind":"setTransforms","sceneId":"s1","payload":{"items":[{"modelId":"m1"}]},"iid":"w1"}',
    '{"kind":"playAnimation","sceneId":"s1","payload":{"modelId":"m1","name":"walk"},"iid":"w1"}',
    '{"kind":"stopAnimation","sceneId":"s1","payload":{"modelId":"m1"},"iid":"w1"}',
    '{"kind":"setCamera","sceneId":"s1","payload":{"position":[0,0,5]},"iid":"w1"}',
    '{"kind":"setLight","sceneId":"s1","payload":{"intensity":2},"iid":"w1"}',
  ]);
});
