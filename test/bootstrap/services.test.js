import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, resolve, pendingIds } from './helpers.mjs';

test('fetchJson sends {id, url, method, headers} with defaults applied in JS', () => {
  const h = loadRuntime();
  h.run(`jsr.fetchJson('http://h/a', { method: 'post', headers: { a: 'b' } })`);
  h.run(`jsr.fetchJson('http://h/b')`);
  assert.deepEqual(h.channelCalls('__jsr_fetch'), [
    '{"id":"i1","url":"http://h/a","method":"post","headers":{"a":"b"},"iid":"w1"}',
    '{"id":"i2","url":"http://h/b","method":"GET","headers":{},"iid":"w1"}',
  ]);
  assert.deepEqual(pendingIds(h.ctx), ['i1', 'i2']);
});

test('fetchJson resolves with the host value and rejects on {__error}', async () => {
  const h = loadRuntime();
  const p1 = h.run(`jsr.fetchJson('http://h/ok')`);
  resolve(h.ctx, 'i1', { status: 200, body: { x: 1 } });
  assert.deepEqual(JSON.parse(JSON.stringify(await p1)), { status: 200, body: { x: 1 } });
  const p2 = h.run(`jsr.fetchJson('http://h/bad')`).catch((e) => e.message);
  resolve(h.ctx, 'i2', { __error: 'fetchJson is disabled in Settings → Apps & Widgets' });
  assert.equal(await p2, 'fetchJson is disabled in Settings → Apps & Widgets');
});

test('exec sends {id, cmd} and resolves through __jsrResolve', async () => {
  const h = loadRuntime();
  const p = h.run(`jsr.exec('ls -l')`);
  assert.deepEqual(h.channelCalls('__jsr_exec'), ['{"id":"i1","cmd":"ls -l","iid":"w1"}']);
  resolve(h.ctx, 'i1', { stdout: 'a\nb' });
  assert.deepEqual(JSON.parse(JSON.stringify(await p)), { stdout: 'a\nb' });
});

test('openUrl stringifies the url; capture defaults opts to {}', () => {
  const h = loadRuntime();
  h.run(`jsr.openUrl(123)`); // String(url)
  h.run(`jsr.capture()`);
  assert.deepEqual(h.channelCalls('__jsr_open_url'), ['{"id":"i1","url":"123","iid":"w1"}']);
  assert.deepEqual(h.channelCalls('__jsr_capture'), ['{"id":"i2","opts":{},"iid":"w1"}']);
});

test('hostCall defaults args to {} and passes the resolved value through', async () => {
  const h = loadRuntime();
  h.run(`jsr.hostCall('args.default')`);
  assert.deepEqual(h.channelCalls('__jsr_host_call'), ['{"id":"i1","name":"args.default","args":{},"iid":"w1"}']);
  const p = h.run(`jsr.hostCall('returns.value')`);
  resolve(h.ctx, 'i2', null);
  assert.equal(await p, null); // the host decides the null->{} mapping, not the bootstrap
});

test('loadAsset sends {id, path}', () => {
  const h = loadRuntime();
  h.run(`jsr.loadAsset('fixtures/data.json')`);
  assert.deepEqual(h.channelCalls('__jsr_load_asset'), ['{"id":"i1","path":"fixtures/data.json","iid":"w1"}']);
});

test('promises resolve in resolution order, not registration order', async () => {
  const h = loadRuntime();
  const order = [];
  const p1 = h.run(`jsr.exec('a')`).then((v) => (order.push(v), v));
  const p2 = h.run(`jsr.exec('b')`).then((v) => (order.push(v), v));
  resolve(h.ctx, 'i2', 'second');
  resolve(h.ctx, 'i1', 'first');
  assert.deepEqual(await Promise.all([p1, p2]), ['first', 'second']);
  assert.deepEqual(order, ['second', 'first']);
});

test('the {__error} shape is the single rejection convention', async () => {
  const h = loadRuntime();
  const pending = [
    h.run(`jsr.exec('a')`).catch((e) => e.message),
    h.run(`jsr.openUrl('http://h')`).catch((e) => e.message),
    h.run(`jsr.capture({})`).catch((e) => e.message),
    h.run(`jsr.hostCall('x')`).catch((e) => e.message),
  ];
  const loadAssetValue = h.run(`jsr.loadAsset('p')`); // loadAsset never rejects
  resolve(h.ctx, 'i1', { __error: 'exec denied' });
  resolve(h.ctx, 'i2', { __error: 'openUrl is not supported by this host' });
  resolve(h.ctx, 'i3', { __error: 'capture is not supported by this host' });
  resolve(h.ctx, 'i4', { __error: 'hostCall is not supported by this host' });
  resolve(h.ctx, 'i5', { __error: 'asset missing' });
  assert.deepEqual(await Promise.all(pending), [
    'exec denied',
    'openUrl is not supported by this host',
    'capture is not supported by this host',
    'hostCall is not supported by this host',
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(await loadAssetValue)), { __error: 'asset missing' });
});
