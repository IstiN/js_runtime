// API group fixture: the console shim. Shared by the vm tests and the
// QuickJS engine runner (test/engine/runner.test.js).
console.log('hello', 'world');
console.warn('careful');
console.error('bad');
console.info('info');
console.debug('debug');
console.time('t');
console.timeEnd('t');
console.timeEnd('never-started');
