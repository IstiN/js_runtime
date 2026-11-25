import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers.mjs';

test('setTimeout sends __jsr_set_interval with once:true and default ms 0', () => {
  const h = loadRuntime();
  const id = h.run(`setTimeout(function(){}, 250)`);
  assert.deepEqual(h.channelCalls('__jsr_set_interval'), ['{"id":"i1","ms":250,"once":true,"iid":"w1"}']);
  const id2 = h.run(`setTimeout(function(){})`);
  assert.equal(id2, 'i2');
  assert.deepEqual(h.channelCalls('__jsr_set_interval')[1], '{"id":"i2","ms":0,"once":true,"iid":"w1"}');
});

test('setInterval sends __jsr_set_interval without once and defaults ms to 1000', () => {
  const h = loadRuntime();
  h.run(`setInterval(function(){})`);
  assert.deepEqual(h.channelCalls('__jsr_set_interval'), ['{"id":"i1","ms":1000,"iid":"w1"}']);
});

test('clearTimeout and clearInterval send the raw id as {iid, id}', () => {
  const h = loadRuntime();
  h.run(`var t = setTimeout(function(){}); clearTimeout(t);
         var u = setInterval(function(){}); clearInterval(u)`);
  assert.deepEqual(h.channelCalls('__jsr_clear_interval'), ['{"iid":"w1","id":"i1"}', '{"iid":"w1","id":"i2"}']);
});

test('clearInterval removes the pending callback', () => {
  const h = loadRuntime();
  h.run(`var u = setInterval(function(){}); clearInterval(u)`);
  assert.equal(h.run(`'i2' in __iv_cbs`), false);
});

test('__jsrInterval fires the interval callback repeatedly', () => {
  const h = loadRuntime();
  h.run(`globalThis.hits = 0; setInterval(function(){ globalThis.hits++; }, 10)`);
  h.run(`__jsrInterval('i1'); __jsrInterval('i1'); __jsrInterval('i1')`);
  assert.equal(h.run(`globalThis.hits`), 3);
});

test('a one-shot timer fires exactly once and then deregisters', () => {
  const h = loadRuntime();
  h.run(`globalThis.hits = 0; setTimeout(function(){ globalThis.hits++; }, 5)`);
  h.run(`__jsrInterval('i1'); __jsrInterval('i1')`);
  assert.equal(h.run(`globalThis.hits`), 1);
  assert.equal(h.run(`'i1' in __iv_cbs`), false);
});

test('timer ids come from the monotonic __nid counter', () => {
  const h = loadRuntime();
  const ids = JSON.parse(h.run(`JSON.stringify([setTimeout(function(){}), setTimeout(function(){}), setInterval(function(){})])`));
  assert.deepEqual(ids, ['i1', 'i2', 'i3']);
  assert.equal(h.run('__nid()'), 'i4');
});
