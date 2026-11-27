// API group fixture: the binary helpers (string lane only — the native
// __jsrSendBytes lane is exercised in the vm tests, where the host function
// can be recorded directly).
jsr.hostCallBinary('scene.transforms', new Uint8Array([1, 2, 3]));
jsr.hostCallBinary('has spaces/only', 'YWJj');
jsr.hostCallBinary('null.data', null);
