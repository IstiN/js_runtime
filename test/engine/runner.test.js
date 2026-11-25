// The same fixtures run in the bare QuickJS engine (build/host/qjs_harness)
// must produce the identical channel trace to the Node vm runner. Boot
// order: --iid, then bootstrap-runtime.js, then the fixture (no three
// preload in this segment).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntime, rootDir } from '../bootstrap/helpers.mjs';

const bin = join(rootDir, 'build', 'host', 'qjs_harness');

function ensureHarness() {
  if (existsSync(bin)) return;
  const r = execFileSync('bash', [join(rootDir, 'tool', 'build_all.sh'), 'host'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (!existsSync(bin)) {
    throw new Error(`could not build build/host/qjs_harness:\n${r}`);
  }
}

const FIXTURES = [
  'console.fixture.js',
  'timers.fixture.js',
  'raf.fixture.js',
  'services.fixture.js',
  'binary.fixture.js',
  'audio.fixture.js',
];

// console.time/timeEnd emit real elapsed milliseconds — nondeterministic by
// nature. Normalize the number before comparing the two engine traces.
const normalize = (line) => line.replace(/t: \d+ms/, 't: <ms>ms');

function vmTrace(fixture) {
  const h = loadRuntime({ iid: 'engine1' });
  h.run(readFileSync(join(rootDir, 'fixtures', fixture), 'utf8'));
  return h.trace().map(normalize).sort();
}

function qjsTrace(fixture) {
  ensureHarness();
  const out = join(rootDir, 'build', `engine-${fixture}.trace`);
  rmSync(out, { force: true });
  execFileSync(
    bin,
    [
      '--iid', 'engine1',
      '--preload', join(rootDir, 'bootstrap-runtime.js'),
      '--script', join(rootDir, 'fixtures', fixture),
      '--out', out,
    ],
    { cwd: rootDir },
  );
  return readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map(normalize).sort();
}

test('the QuickJS engine reproduces the vm channel trace of every fixture', () => {
  for (const fixture of FIXTURES) {
    assert.deepEqual(qjsTrace(fixture), vmTrace(fixture), fixture);
  }
});
