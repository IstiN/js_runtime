import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM with .mjs so the file runs with and without a package.json.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(root, 'build', 'host', 'qjs_harness');

if (!existsSync(bin)) {
  const r = spawnSync('bash', [path.join(root, 'tool', 'build_all.sh'), 'host'], {
    cwd: root, encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`could not build build/host/qjs_harness:\n${r.stdout}\n${r.stderr}`);
  }
}

function run(args) {
  return spawnSync(bin, args, { encoding: 'utf8' });
}

function withTmp(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'qjs-harness-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function write(dir, name, js) {
  const file = path.join(dir, name);
  writeFileSync(file, js);
  return file;
}

test('items run in the given order; sendMessage prints channel<TAB>payload', () => {
  withTmp((dir) => {
    const a = write(dir, 'a.js', "sendMessage('a', '1');");
    const c = write(dir, 'c.js', "sendMessage('c', '3');");
    const r = run(['--script', a, '--call', "sendMessage('call', '2');", '--script', c]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.split('\n').filter(Boolean), ['a\t1', 'call\t2', 'c\t3']);
  });
});

test('--preload runs first and its globals reach later scripts', () => {
  withTmp((dir) => {
    const pre = write(dir, 'pre.js', "globalThis.helper = function (n) { return 'h' + n; };");
    const s = write(dir, 's.js', "sendMessage('use', helper(7));");
    const r = run(['--preload', pre, '--script', s]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.split('\n').filter(Boolean), ['use\th7']);
  });
});

test('--iid installs the __IID global before the items', () => {
  withTmp((dir) => {
    const s = write(dir, 'iid.js', "sendMessage('iid', __IID);");
    const r = run(['--iid', 'inst-42', '--script', s]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.split('\n').filter(Boolean), ['iid\tinst-42']);
  });
});

test('promise jobs are drained after each item', () => {
  withTmp((dir) => {
    const s = write(
      dir,
      'job.js',
      "Promise.resolve().then(function () { sendMessage('job', 'drained'); });",
    );
    const r = run(['--script', s, '--call', "sendMessage('after', 'x');"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.split('\n').filter(Boolean), ['job\tdrained', 'after\tx']);
  });
});

test('--out writes the lines to the file instead of stdout', () => {
  withTmp((dir) => {
    const s = write(dir, 'o.js', "sendMessage('out', 'file');");
    const out = path.join(dir, 'lines.tsv');
    const r = run(['--script', s, '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(readFileSync(out, 'utf8'), 'out\tfile\n');
  });
});

test('an exception in an item exits 1 and prints the exception on stderr', () => {
  withTmp((dir) => {
    const bad = write(dir, 'bad.js', "throw new Error('boom-token');");
    const good = write(dir, 'good.js', "sendMessage('ok', 'before');");
    const r = run(['--script', good, '--script', bad]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /boom-token/);
  });
});
