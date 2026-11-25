// Cross-checked line-by-line: every channel the pinned reference bridge can
// dispatch must be a complete row of docs/PROTOCOL.md. The pin comes from
// conformance.lock via scripts/fetch-conformance.sh (CI runs it after
// checkout; the test runs it on demand when the tree is absent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pinned = join(
  root,
  '.conformance',
  'flutter_js_widget_runtime',
  'lib',
  'src',
  'runtime',
  'js_widget_bridge.dart',
);
if (!existsSync(pinned)) {
  execFileSync('bash', [join(root, 'scripts', 'fetch-conformance.sh')], {
    cwd: root,
    stdio: 'inherit',
  });
}
const bridge = readFileSync(pinned, 'utf8');
const protocol = readFileSync(join(root, 'docs', 'PROTOCOL.md'), 'utf8');

// Keys of the two handler maps, with the Dart handler each channel maps to.
function handlerMap(variableName) {
  const start = bridge.indexOf(`${variableName} =`);
  assert.notEqual(start, -1, `${variableName} not found in the pinned bridge`);
  const open = bridge.indexOf('{', start);
  const end = bridge.indexOf('};', open);
  assert.notEqual(end, -1, `${variableName} map end not found`);
  const body = bridge.slice(start, end);
  const entries = {};
  for (const m of body.matchAll(/'(__jsr_[a-z0-9_]+)':\s*(_\w+)/g)) {
    entries[m[1]] = m[2];
  }
  assert.ok(Object.keys(entries).length > 0, `${variableName} has no entries`);
  return entries;
}

const sync = handlerMap('_syncChannelHandlers');
const async = handlerMap('_asyncChannelHandlers');
const channels = { ...sync, ...async };

// Rows of the channel table: section 3 of docs/PROTOCOL.md.
function protocolRows() {
  const lines = protocol.split('\n');
  const header = lines.findIndex((l) =>
    l.startsWith('| Channel | Tier | Direction |'),
  );
  assert.notEqual(header, -1, 'channel table header not found');
  assert.ok(
    lines[header + 1].match(/^\|---/),
    'channel table separator missing',
  );
  const rows = new Map();
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('| `__jsr_')) break;
    // Cells split on unescaped pipes only.
    const cells = line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
    assert.equal(cells.length, 8, `row has ${cells.length} columns: ${line}`);
    const name = cells[0].replace(/^`|`$/g, '');
    rows.set(name, cells);
  }
  return rows;
}

const rows = protocolRows();

test('every channel of the pinned bridge is a PROTOCOL.md row', () => {
  for (const [channel, handler] of Object.entries(channels)) {
    assert.ok(
      rows.has(channel),
      `channel ${channel} (handler ${handler}) is missing from docs/PROTOCOL.md`,
    );
  }
});

test('every channel row is complete: no empty cell, no placeholder', () => {
  for (const [channel, cells] of rows) {
    cells.forEach((cell, i) => {
      assert.ok(
        !/^\s*$/.test(cell),
        `${channel}: column ${i + 1} is empty`,
      );
      assert.ok(
        !/TODO|TBD|FIXME|placeholder|\.\.\.$/.test(cell),
        `${channel}: column ${i + 1} has a placeholder`,
      );
    });
  }
});

test('the Dart handler column matches the pinned bridge', () => {
  for (const [channel, handler] of Object.entries(channels)) {
    assert.equal(
      rows.get(channel)[6],
      `\`${handler}\``,
      `${channel}: Dart handler column disagrees with the pinned bridge`,
    );
  }
});

test('the reference has exactly the documented channel set', () => {
  assert.equal(Object.keys(channels).length, 21);
  assert.equal(rows.size, 21);
  const documented = new Set(
    [...protocol.matchAll(/`(__jsr_[a-z0-9_]+)`/g)].map((m) => m[1]),
  );
  for (const channel of Object.keys(channels)) {
    assert.ok(documented.has(channel));
  }
});

test('dispatch order: async channels are awaited before the sync fallback', () => {
  const dispatch = bridge.indexOf('Future<void> dispatch(');
  const order = bridge.slice(dispatch, dispatch + 1200);
  assert.ok(order.indexOf('_asyncChannelHandlers[channel]') !== -1);
  assert.ok(order.indexOf('_syncChannelHandlers[channel]?.call') !== -1);
  assert.ok(
    order.indexOf('_asyncChannelHandlers[channel]') <
      order.indexOf('_syncChannelHandlers[channel]?.call'),
  );
});
