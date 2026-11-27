// Shared fake host for the bootstrap tests: a Node vm context with a
// recording sendMessage. The vm context provides the standard JS intrinsics
// (Object, Math, Promise, Uint8Array, ...); the bootstrap defines its own
// console, timers and rAF on top.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const runtimeJs = readFileSync(join(root, 'bootstrap-runtime.js'), 'utf8');
export const rootDir = root;

// Deterministic LCG replacing Math.random inside the context, so noise
// oscillators and byte comparisons are reproducible.
const seededRandom = `
var __rand = (function(){
  var s = 42;
  return function(){
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
})();
Math.random = __rand;
`;

export function loadRuntime({ iid = 'w1', rawBinary = false, sendBytes = null } = {}) {
  const calls = [];
  const ctx = {
    __IID: iid,
    sendMessage: (channel, payload) => calls.push([channel, payload]),
  };
  if (rawBinary) ctx.__JSR_RAW_BINARY__ = true;
  if (sendBytes) ctx.__jsrSendBytes = sendBytes;
  vm.createContext(ctx);
  vm.runInContext(seededRandom, ctx);
  vm.runInContext(runtimeJs, ctx, { filename: join(root, 'bootstrap-runtime.js') });
  return {
    ctx,
    calls,
    run: (code) => vm.runInContext(code, ctx),
    trace: () => calls.map(([c, p]) => `${c}\t${p}`),
    channelCalls: (channel) => calls.filter(([c]) => c === channel).map(([, p]) => p),
  };
}

// Resolves a pending promise callback registered under `id` with `value`
// (the host side of the protocol: __jsrResolve).
export function resolve(ctx, id, value) {
  vm.runInContext(
    `__jsrResolve(${JSON.stringify(id)}, ${JSON.stringify(value)})`,
    ctx,
  );
}

export function pendingIds(ctx) {
  // JSON round-trip: values created inside the vm context have their own
  // realm's prototypes and fail host-side deepStrictEqual.
  return JSON.parse(vm.runInContext('JSON.stringify(Object.keys(__cbs))', ctx));
}
