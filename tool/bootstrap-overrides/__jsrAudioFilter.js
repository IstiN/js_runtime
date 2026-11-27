// CRAP override for __jsrAudioFilter (reference CC 8): the optional
// (undefined-or-null) numeric field moves to a shared helper. Same checks,
// same error messages, same defaults.
function __jsrAudioFilter(spec){
  if (spec === undefined || spec === null) return null;
  if (typeof spec !== 'object') {
    throw new Error('audio.synth: filter must be an object');
  }
  var type = String(spec.type || 'lowpass').toLowerCase();
  if (['lowpass', 'highpass', 'bandpass'].indexOf(type) < 0) {
    throw new Error('audio.synth: unsupported filter type "' + type + '"');
  }
  return {
    type: type,
    frequency: __jsrAudioNumber(spec, 'frequency', 1000, 1, 20000, 'filter.frequency'),
    frequencyEnd: __jsrAudioOptionalNumber(spec, 'frequencyEnd', 1, 20000, 'filter.frequencyEnd'),
    q: __jsrAudioNumber(spec, 'q', 0.707, 0.01, 24, 'filter.q'),
  };
}
// jsr-append-top-level
function __jsrAudioOptionalNumber(spec, key, min, max, label){
  var v = spec ? spec[key] : undefined;
  if (v === undefined || v === null) return null;
  return __jsrAudioNumber(spec, key, 0, min, max, label);
}
