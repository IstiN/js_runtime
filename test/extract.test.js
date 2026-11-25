// The generator is a contract for the whole family: a consumer repository
// runs it against its own pin with --reference/--pin/--out and gets the
// byte-identical runtime half, or the widget half alone with --emit-widget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const generator = join(root, 'scripts', 'extract_bootstrap.mjs');
const reference = join(
  root,
  '.conformance',
  'flutter_js_widget_runtime',
  'lib',
  'src',
  'runtime',
  'js_widget_bootstrap.dart',
);
const pin = readFileSync(join(root, 'conformance.lock'), 'utf8')
  .trim()
  .match(/@([0-9a-f]{40})/)[1];

function runGenerator(args) {
  return execFileSync('node', [generator, ...args], { cwd: root, encoding: 'utf8' });
}

test('--reference + --pin + --out reproduces the committed runtime half byte for byte', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsr-extract-'));
  try {
    const out = join(dir, 'bootstrap-runtime.js');
    runGenerator(['--reference', reference, '--pin', pin, '--out', out]);
    assert.equal(
      readFileSync(out, 'utf8'),
      readFileSync(join(root, 'bootstrap-runtime.js'), 'utf8'),
    );
    // the provenance line carries the --pin sha
    assert.match(
      readFileSync(out, 'utf8'),
      new RegExp(`Generated from IstiN/flutter_js_widget_runtime@${pin}`),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--emit-widget writes only the widget half starting with Object.assign(jsr, {', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jsr-extract-'));
  try {
    const widget = join(dir, 'bootstrap-widget.js');
    const out = join(dir, 'bootstrap-runtime.js');
    runGenerator(['--reference', reference, '--pin', pin, '--emit-widget', widget]);
    assert.equal(existsSync(out), false, '--emit-widget alone must not write the runtime half');
    const text = readFileSync(widget, 'utf8');
    assert.ok(text.startsWith('Object.assign(jsr, {'));
    assert.ok(text.includes('__jsrHostEvent'));
    for (const member of [
      'render:', 'setTitle:', 'showError:', 'onEvent:', '_handler:', 'onKey:',
      '_keyHandler:', 'theme:', 'onThemeChange:', '_onThemeChange:',
      'viewport:', '_viewport:', '_viewportHandler:', 'onViewport:',
      'breakpoint:', 'adaptive:', 'ease:', 'motion:', '_easeFn:',
    ]) {
      assert.ok(new RegExp(`(^|\\n)\\s*${member}`).test(text), `widget member ${member} missing`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});