import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers.mjs';

test('requestAnimationFrame sends __jsr_raf with its explicit iid', () => {
  const h = loadRuntime();
  h.run(`requestAnimationFrame(function(){})`);
  assert.deepEqual(h.channelCalls('__jsr_raf'), ['{"id":"i1","iid":"w1"}']);
});

test('__jsrRaf fires with elapsed ms and is one-shot', () => {
  const h = loadRuntime();
  h.run(`globalThis.frames = []; requestAnimationFrame(function(dt){ globalThis.frames.push(dt) })`);
  h.run(`__jsrRaf('i1', 16)`);
  h.run(`__jsrRaf('i1', 32)`);
  assert.deepEqual(JSON.parse(h.run(`JSON.stringify(globalThis.frames)`)), [16]);
  assert.equal(h.run(`'i1' in __raf_cbs`), false);
});

test('cancelAnimationFrame sends __jsr_caf and drops the pending frame', () => {
  const h = loadRuntime();
  h.run(`var f = requestAnimationFrame(function(){}); cancelAnimationFrame(f)`);
  assert.deepEqual(h.channelCalls('__jsr_caf'), ['{"iid":"w1","id":"i1"}']);
  h.run(`__jsrRaf('i1', 16)`);
  assert.deepEqual(h.channelCalls('__jsr_raf'), ['{"id":"i1","iid":"w1"}']);
});
