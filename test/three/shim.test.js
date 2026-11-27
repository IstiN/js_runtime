import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHIM = readFileSync(path.resolve(HERE, '../../libs/three/three-shim.js'), 'utf8');

test('shim leaves an existing document untouched', () => {
  const original = { createElement: () => ({ real: true }) };
  const sandbox = { document: original };
  vm.runInNewContext(SHIM, sandbox, { filename: path.resolve(HERE, "../../libs/three/three-shim.js") });
  assert.equal(sandbox.document, original);
  assert.deepEqual(sandbox.document.createElement('canvas'), { real: true });
});

test('shim throws the named error without a host canvas', () => {
  const sandbox = {};
  vm.runInNewContext(SHIM, sandbox, { filename: path.resolve(HERE, "../../libs/three/three-shim.js") });
  const canvas = sandbox.document.createElement('canvas');
  assert.throws(() => canvas.getContext('2d'),
    /three\.unsupported: canvas backend not available/);
  assert.throws(() => sandbox.document.createElement('div'),
    /three\.unsupported: canvas backend not available/);
  assert.throws(() => sandbox.document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas').getContext('webgl2'),
    /three\.unsupported: canvas backend not available/);
});

test('shim routes getContext to the registered host canvas', () => {
  const sandbox = {};
  vm.runInNewContext(SHIM, sandbox, { filename: path.resolve(HERE, "../../libs/three/three-shim.js") });
  const created = [];
  sandbox.__jsrCreateCanvas = (type) => {
    created.push(type);
    return { backend: 'host', type };
  };
  const canvas = sandbox.document.createElement('canvas');
  assert.deepEqual(canvas.getContext('webgl2'), { backend: 'host', type: 'webgl2' });
  assert.deepEqual(canvas.getContext('2d'), { backend: 'host', type: '2d' });
  assert.deepEqual(created, ['webgl2', '2d']);
  assert.equal(canvas.width, 300);
  assert.equal(canvas.height, 150);
});
