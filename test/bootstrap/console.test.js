import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRuntime, rootDir } from './helpers.mjs';

test('console.log joins arguments with spaces on __jsr_log', () => {
  const h = loadRuntime();
  h.run(`console.log('hello', 'world', 1)`);
  assert.deepEqual(h.channelCalls('__jsr_log'), ['{"iid":"w1","id":"hello world 1"}']);
});

test('console.warn and console.error add [W]/[E] prefixes', () => {
  const h = loadRuntime();
  h.run(`console.warn('careful'); console.error('bad')`);
  assert.deepEqual(h.channelCalls('__jsr_log'), ['{"iid":"w1","id":"[W] careful"}', '{"iid":"w1","id":"[E] bad"}']);
});

test('console.info and console.debug share the log channel without prefix', () => {
  const h = loadRuntime();
  h.run(`console.info('i'); console.debug('d')`);
  assert.deepEqual(h.channelCalls('__jsr_log'), ['{"iid":"w1","id":"i"}', '{"iid":"w1","id":"d"}']);
});

test('console.time/timeEnd report elapsed ms; unknown label is silent', () => {
  const h = loadRuntime();
  h.run(`console.time('t')`);
  const lines = h.channelCalls('__jsr_log');
  assert.equal(lines.length, 0); // time itself does not log
  h.run(`console.timeEnd('t'); console.timeEnd('never')`);
  const after = h.channelCalls('__jsr_log').map((p) => JSON.parse(p).id);
  assert.match(after[0], /^t: \d+ms$/);
  assert.equal(after.length, 1);
});

test('console is a plain object defined by the runtime half', () => {
  const h = loadRuntime();
  assert.deepEqual(
    JSON.parse(h.run(`JSON.stringify(Object.keys(console).sort())`)),
    ['debug', 'error', 'info', 'log', 'time', 'timeEnd', 'warn'],
  );
});
