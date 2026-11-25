import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessAvailable, runQjs, BUNDLE } from './qjs-run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARITY = path.join(HERE, 'math-parity.js');
const SCRIPT = readFileSync(PARITY, 'utf8');
const PREFIX = 'console.log\t';

function quickjsJson() {
  const { status, stdout, stderr } = runQjs(['--iid', 'parity', '--preload', BUNDLE, '--script', PARITY]);
  assert.equal(status, 0, `qjs_harness failed: ${stderr}`);
  const line = stdout.split('\n').find((l) => l.startsWith(PREFIX));
  assert.ok(line, 'parity script printed no console.log line');
  return line.slice(PREFIX.length);
}

async function chromiumJson() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let logged = null;
    page.on('console', (msg) => {
      if (msg.type() === 'log' && logged === null) logged = msg.text();
    });
    await page.addScriptTag({ path: BUNDLE }); // the Chromium --preload
    await page.addScriptTag({ content: SCRIPT });
    assert.ok(logged, 'parity script printed no console.log line in Chromium');
    return logged;
  } finally {
    await browser.close();
  }
}

test('three math parity: Chromium and QuickJS agree', async (t) => {
  if (!harnessAvailable()) return t.skip('build/host/qjs_harness missing — run: bash tool/build_all.sh host');
  let browserJson;
  try {
    browserJson = await chromiumJson();
  } catch (error) {
    if (process.env.JSR_REQUIRE_BROWSER === '1') {
      t.fail(`Chromium is required (JSR_REQUIRE_BROWSER=1): ${error.message}`);
    } else {
      t.skip(`Chromium unavailable: ${error.message} — run: npx playwright install chromium`);
    }
    return;
  }
  assert.deepEqual(JSON.parse(browserJson), JSON.parse(quickjsJson()));
});
