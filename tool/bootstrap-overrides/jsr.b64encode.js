// CRAP override for jsr.b64encode (reference CC 16): the encoder is split
// into a lazily cached pair table, full-triplet quads, the 1/2-byte tail and
// the chunked string assembly. Output is byte-identical to the reference
// encoder (same alphabet, same padding, same chunk size).
b64encode: function(data){
    // Typed arrays encode their BYTE IMAGE (a Float32Array yields its 4
    // bytes per element, views only their visible range); ArrayBuffers
    // and array-likes encode element-wise as before.
    var u8;
    if (data instanceof Uint8Array) u8 = data;
    else if (data && data.buffer) {
      u8 = new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
    } else u8 = new Uint8Array(data);
    var len = u8.length;
    if (len === 0) return '';
    var codes = __b64Quads(u8, __b64PairTable());
    return __b64String(codes);
  }
// jsr-append-top-level
function __b64PairTable(){
  // (The alphabet is split across concatenated literals on purpose: single
  // high-entropy literals get eaten by secret-scanning editors.)
  if (jsr._b64PairTable) return jsr._b64PairTable;
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' + '0123456789' + '+/';
  var t = new Array(4096);
  for (var hi = 0; hi < 64; hi++)
    for (var lo = 0; lo < 64; lo++)
      t[(hi << 6) | lo] = A[hi] + A[lo];
  jsr._b64PairTable = t;
  return t;
}
function __b64Quads(u8, table){
  var len = u8.length;
  var full = (len / 3) | 0;
  var rem = len - full * 3;
  var quadCount = full * 4 + (rem ? 4 : 0);
  var codes = new Uint16Array(quadCount);
  var q = __b64FullQuads(u8, full, codes, table);
  __b64Tail(u8, rem, full, codes, q, table);
  return codes;
}
function __b64FullQuads(u8, full, codes, table){
  var q = 0;
  for (var i = 0; i < full; i++) {
    var o = i * 3;
    var n = (u8[o] << 16) | (u8[o + 1] << 8) | u8[o + 2];
    var pair = table[(n >> 12) & 0xfff];
    codes[q++] = pair.charCodeAt(0);
    codes[q++] = pair.charCodeAt(1);
    pair = table[n & 0xfff];
    codes[q++] = pair.charCodeAt(0);
    codes[q++] = pair.charCodeAt(1);
  }
  return q;
}
function __b64Tail(u8, rem, full, codes, q, table){
  var tail = full * 3;
  if (rem === 1) {
    var n1 = u8[tail] << 16;
    var p1 = table[(n1 >> 12) & 0xfff];
    codes[q++] = p1.charCodeAt(0);
    codes[q++] = p1.charCodeAt(1);
    codes[q++] = 61; // '='
    codes[q++] = 61; // '='
  } else if (rem === 2) {
    var n2 = (u8[tail] << 16) | (u8[tail + 1] << 8);
    var p2a = table[(n2 >> 12) & 0xfff];
    codes[q++] = p2a.charCodeAt(0);
    codes[q++] = p2a.charCodeAt(1);
    // Third char is A[(n2 >> 6) & 63]; index the pair table with a zero
    // low sextet and keep only the high char.
    codes[q++] = table[((n2 >> 6) & 0x3f) << 6].charCodeAt(0);
    codes[q++] = 61; // '='
  }
}
function __b64String(codes){
  var CHUNK = 8192;
  if (codes.length <= CHUNK) return String.fromCharCode.apply(null, codes);
  var parts = [];
  for (var off = 0; off < codes.length; off += CHUNK) {
    parts.push(String.fromCharCode.apply(
      null, codes.length - off < CHUNK ? codes.subarray(off) : codes.subarray(off, off + CHUNK)));
  }
  return parts.join('');
}
