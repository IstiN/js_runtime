import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessAvailable, runQjs, BUNDLE } from './qjs-run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures/minimal.js');

test('minimal Scene/Mesh fixture runs in bare QuickJS', (t) => {
  if (!harnessAvailable()) return t.skip('build/host/qjs_harness missing — run: bash tool/build_all.sh host');
  const { status, stdout, stderr } = runQjs([
    '--iid', 't1',
    '--call', 'globalThis.THREE = undefined;',
    '--preload', BUNDLE,
    '--script', FIXTURE
  ]);
  assert.equal(status, 0, `qjs_harness failed: ${stderr}`);
  const line = stdout.split('\n').find((l) => l.startsWith('three-probe\t'));
  assert.ok(line, 'fixture sent no three-probe message');
  const payload = JSON.parse(line.slice('three-probe\t'.length));
  assert.equal(payload.sceneType, 'Scene');
  assert.equal(payload.children, 1);
  assert.equal(payload.hasPosition, true);
  assert.equal(payload.vertices, 24);
});
