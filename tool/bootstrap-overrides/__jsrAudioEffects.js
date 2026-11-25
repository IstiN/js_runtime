// CRAP override for __jsrAudioEffects (reference CC 11): one effect is
// validated per item by __jsrAudioEffect, with delay/reverb field groups in
// their own helpers. Validation order and error messages are identical.
function __jsrAudioEffects(spec){
  if (spec === undefined || spec === null) return [];
  var list = spec instanceof Array ? spec : [spec];
  if (list.length > 8) {
    throw new Error('audio.synth: track effect limit is 8');
  }
  var out = [];
  for (var i = 0; i < list.length; i++) {
    out.push(__jsrAudioEffect(list[i]));
  }
  return out;
}
// jsr-append-top-level
function __jsrAudioEffect(raw){
  if (!raw || typeof raw !== 'object') {
    throw new Error('audio.synth: effect must be an object');
  }
  var type = String(raw.type || '').toLowerCase();
  if (type === 'delay') return __jsrAudioDelayEffect(raw);
  if (type === 'reverb') return __jsrAudioReverbEffect(raw);
  throw new Error('audio.synth: unsupported effect type "' + type + '"');
}
function __jsrAudioDelayEffect(raw){
  return {
    type: 'delay',
    time: __jsrAudioNumber(raw, 'time', 0.25, 0.001, 5, 'delay.time'),
    feedback: __jsrAudioNumber(raw, 'feedback', 0.35, 0, 0.95, 'delay.feedback'),
    mix: __jsrAudioNumber(raw, 'mix', 0.35, 0, 1, 'delay.mix'),
  };
}
function __jsrAudioReverbEffect(raw){
  return {
    type: 'reverb',
    decay: __jsrAudioNumber(raw, 'decay', 1.2, 0.05, 10, 'reverb.decay'),
    mix: __jsrAudioNumber(raw, 'mix', 0.3, 0, 1, 'reverb.mix'),
  };
}
