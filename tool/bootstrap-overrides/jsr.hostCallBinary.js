// CRAP override for jsr.hostCallBinary (reference CC 9): the string-lane
// branch moves to a top-level helper; the member keeps only the native
// bytes-lane detection. Same lanes, same payload shapes.
hostCallBinary: function(name, data){
    var n = String(name).replace(/[^A-Za-z0-9._\-]/g, '_');
    // Native bytes lane: a typed array crosses by (pointer, length) with
    // zero encode. Subarray views send only their visible range.
    if (typeof __jsrSendBytes === 'function' && data &&
        typeof data === 'object' && data.buffer) {
      __jsrSendBytes(n, new Uint8Array(data.buffer,
        data.byteOffset || 0, data.byteLength));
      return;
    }
    __jsrSendBinaryString(n, data);
  }
// jsr-append-top-level
function __jsrSendBinaryString(n, data){
  // String path: pre-encoded b64 passes through, typed arrays on
  // engines without the native lane encode first.
  var b64 = (typeof data === 'string') ? data : jsr.b64encode(data);
  var d = String(b64 == null ? '' : b64);
  // Engines with per-engine isolation (QuickJS) advertise __JSR_RAW_BINARY__:
  // skip the {iid,id} wrapper — a plain `<name> <base64>` string crosses
  // with zero JSON work on either side. Shared-runtime engines keep the
  // tagged path for correct cross-engine routing.
  var d2 = n + ' ' + d;
  if (typeof __JSR_RAW_BINARY__ !== 'undefined') {
    sendMessage('__jsr_host_call_binary', d2);
  } else {
    __send('__jsr_host_call_binary', d2);
  }
}
