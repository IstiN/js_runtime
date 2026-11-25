import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers.mjs';

test('b64encode matches the RFC 4648 test vectors', () => {
  const h = loadRuntime();
  const vectors = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ];
  for (const [input, expected] of vectors) {
    const got = h.run(`jsr.b64encode(new Uint8Array(Array.from('${input}', c => c.charCodeAt(0))))`);
    assert.equal(got, expected);
  }
});

test('b64encode encodes the byte image of typed arrays and views', () => {
  const h = loadRuntime();
  assert.equal(h.run(`jsr.b64encode(new Uint8Array([1, 2, 3]))`), 'AQID');
  // Float32Array encodes its 4 bytes per element (2 32-bit floats here)
  assert.equal(
    h.run(`jsr.b64encode(new Float32Array(new Uint8Array([1,2,3,4,5,6,7,8]).buffer))`),
    'AQIDBAUGBwg=',
  );
  // A subarray view encodes only its visible range
  assert.equal(h.run(`jsr.b64encode(new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4))`), 'AQID');
  // ArrayBuffers encode their bytes; array-likes element-wise
  assert.equal(h.run(`jsr.b64encode(new Uint8Array([1, 2, 3]).buffer)`), 'AQID');
  assert.equal(h.run(`jsr.b64encode([255])`), '/w==');
  assert.equal(h.run(`jsr.b64encode(new Uint8Array(0))`), '');
});

test('hostCallBinary sends "<name> <base64>" on the tagged string lane', () => {
  const h = loadRuntime();
  h.run(`jsr.hostCallBinary('scene.transforms', new Uint8Array([1, 2, 3]))`);
  assert.deepEqual(h.channelCalls('__jsr_host_call_binary'), [
    '{"iid":"w1","id":"scene.transforms AQID"}',
  ]);
});

test('hostCallBinary sanitizes the name and tolerates null data', () => {
  const h = loadRuntime();
  h.run(`jsr.hostCallBinary('has spaces/only', 'YWJj')`);
  h.run(`jsr.hostCallBinary('null.data', null)`);
  assert.deepEqual(h.channelCalls('__jsr_host_call_binary'), [
    '{"iid":"w1","id":"has_spaces_only YWJj"}',
    '{"iid":"w1","id":"null.data "}',
  ]);
});

test('engines advertising __JSR_RAW_BINARY__ get the untagged string lane', () => {
  const h = loadRuntime({ rawBinary: true });
  h.run(`jsr.hostCallBinary('lane', new Uint8Array([1, 2, 3]))`);
  assert.deepEqual(h.channelCalls('__jsr_host_call_binary'), ['lane AQID']);
});

test('typed arrays cross the native __jsrSendBytes lane by (name, view)', () => {
  let seen = null;
  const h = loadRuntime({ sendBytes: (name, bytes) => { seen = [name, Array.from(bytes)]; } });
  h.run(`jsr.hostCallBinary('t.bin', new Uint8Array([9, 8, 7]).subarray(1))`);
  assert.deepEqual(seen, ['t.bin', [8, 7]]);
  assert.equal(h.channelCalls('__jsr_host_call_binary').length, 0); // no string fallback
});

test('b64encode pair table is cached on jsr', () => {
  const h = loadRuntime();
  h.run(`jsr.b64encode(new Uint8Array([1, 2, 3]))`);
  assert.equal(h.run(`jsr._b64PairTable instanceof Array`), true);
});
