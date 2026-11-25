// CRAP override for __JsAudioSynth.prototype.osc (reference CC 17): the
// oscillator type, frequency requirement and noiseColor validation move to
// helpers; the event object is assembled with the same field evaluation
// order, so validation errors surface in the same sequence.
__JsAudioSynth.prototype.osc = function(opts){
  if (this.events.length >= 4096) {
    throw new Error('audio.synth: event limit is 4096 per track');
  }
  opts = opts || {};
  var type = __jsrAudioOscType(opts);
  var frequency = __jsrAudioOscFrequency(opts, type);
  this.events.push({
    type: type,
    frequency: frequency,
    frequencyEnd: __jsrAudioNumber(opts, 'frequencyEnd', 0, 1, 20000, 'frequencyEnd'),
    detune: __jsrAudioNumber(opts, 'detune', 0, -4800, 4800, 'detune'),
    start: __jsrAudioNumber(opts, 'start', 0, 0, __jsrAudioMaxDuration, 'start'),
    duration: __jsrAudioNumber(opts, 'duration', 0.25, 0.001, __jsrAudioMaxDuration, 'duration'),
    gain: __jsrAudioNumber(opts, 'gain', 0.8, 0, 1, 'gain'),
    attack: __jsrAudioNumber(opts, 'attack', 0.005, 0, 10, 'attack'),
    decay: __jsrAudioNumber(opts, 'decay', 0.02, 0, 10, 'decay'),
    sustain: __jsrAudioNumber(opts, 'sustain', 0.7, 0, 1, 'sustain'),
    release: __jsrAudioNumber(opts, 'release', 0.05, 0, 10, 'release'),
    pan: __jsrAudioNumber(opts, 'pan', 0, -1, 1, 'pan'),
    noiseColor: __jsrAudioOscNoiseColor(opts, type),
    filter: __jsrAudioFilter(opts.filter),
    vibrato: __jsrAudioLfo(opts.vibrato, 'vibrato', 5, 20, 480),
    tremolo: __jsrAudioLfo(opts.tremolo, 'tremolo', 5, 0.5, 1),
    drive: __jsrAudioNumber(opts, 'drive', 0, 0, 20, 'drive'),
    driveMix: __jsrAudioNumber(opts, 'driveMix', 1, 0, 1, 'driveMix'),
    fm: __jsrAudioFm(opts.fm),
  });
  return this;
};
// jsr-append-top-level
function __jsrAudioOscType(opts){
  var type = String(opts.type || opts.wave || 'sine').toLowerCase();
  if (type === 'white') type = 'noise';
  if (['sine', 'square', 'sawtooth', 'triangle', 'noise'].indexOf(type) < 0) {
    throw new Error('audio.synth: unsupported oscillator type "' + type + '"');
  }
  return type;
}
function __jsrAudioOscFrequency(opts, type){
  var frequency = type === 'noise'
    ? 0
    : __jsrAudioNumber(opts, 'frequency', 0, 1, 20000, 'frequency');
  if (type !== 'noise' && frequency <= 0) {
    throw new Error('audio.synth: frequency is required for ' + type);
  }
  return frequency;
}
function __jsrAudioOscNoiseColor(opts, type){
  var noiseColor = null;
  if (type === 'noise') {
    noiseColor = String(opts.noiseColor || 'white').toLowerCase();
    if (['white', 'pink', 'brown'].indexOf(noiseColor) < 0) {
      throw new Error(
        'audio.synth: unsupported noiseColor "' + noiseColor + '"');
    }
  } else if (opts.noiseColor !== undefined && opts.noiseColor !== null) {
    throw new Error('audio.synth: noiseColor is only valid for type "noise"');
  }
  return noiseColor;
}
