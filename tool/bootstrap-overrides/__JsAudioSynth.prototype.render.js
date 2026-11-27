// CRAP override for __JsAudioSynth.prototype.render (reference CC 62): the
// track length validation, PCM allocation, per-event fill and sample chain
// (envelope, vibrato, FM, noise/oscillator, filter, drive, tremolo, mix)
// become helpers driven by a per-event state object. The sample math,
// mutation order and every error message are identical to the reference.
var __jsrAudioPi2 = Math.PI * 2;

__JsAudioSynth.prototype.render = function(){
  var self = this;
  return new Promise(function(resolve, reject){
    var sampleRate = self.sampleRate;
    var channels = self.channels;
    var events = self.events;
    if (events.length === 0) {
      reject(new Error('audio.synth: track has no osc/note events'));
      return;
    }
    var totalSeconds = __jsrAudioTrackSeconds(self);
    var frames = Math.ceil(totalSeconds * sampleRate);
    var totalSamples = frames * channels;
    if (totalSamples > __jsrAudioMaxSamples) {
      reject(new Error('audio.synth: rendered PCM exceeds the 64 MiB limit'));
      return;
    }

    var pcm = new Float32Array(totalSamples);
    __jsrAudioFillTrack(pcm, events, sampleRate, channels);
    __jsrAudioApplyTrackEffects(pcm, sampleRate, channels, self.effects);
    __jsrAudioClampPcm(pcm);

    var id = __nid();
    __cbs[id] = function(r){
      if (r && r.__error) reject(new Error(r.__error));
      else resolve(r);
    };
    try {
      jsr.hostCallBinary('audio.synth', __jsrAudioEnvelope(
        id, self.name, sampleRate, channels, frames, pcm));
    } catch (err) {
      delete __cbs[id];
      reject(err);
    }
  });
};
// jsr-append-top-level
function __jsrAudioTrackSeconds(self){
  var totalSeconds = self.duration;
  var events = self.events;
  if (totalSeconds === null) {
    totalSeconds = 0;
    for (var e = 0; e < events.length; e++) {
      var end = events[e].start + events[e].duration + events[e].release;
      if (end > totalSeconds) totalSeconds = end;
    }
    totalSeconds += __jsrAudioEffectTailSeconds(self.effects);
    if (totalSeconds <= 0 || totalSeconds > __jsrAudioMaxDuration) {
      throw new Error('audio.synth: rendered duration must be 0..' +
        __jsrAudioMaxDuration + ' seconds');
    }
  }
  return totalSeconds;
}
function __jsrAudioFillTrack(pcm, events, sampleRate, channels){
  for (var n = 0; n < events.length; n++) {
    __jsrAudioFillEvent(pcm, events[n], sampleRate, channels);
  }
}
function __jsrAudioFillEvent(pcm, ev, sampleRate, channels){
  var frames = pcm.length / channels;
  var start = Math.floor(ev.start * sampleRate);
  if (start >= frames) return;
  var end = Math.min(
    frames,
    Math.ceil((ev.start + ev.duration + ev.release) * sampleRate));
  if (end <= start) return;
  var st = __jsrAudioEventContext(ev, sampleRate, channels);
  for (var i = start; i < end; i++) {
    var x = i - start;
    var env = __jsrAudioEnvelopeValue(x, st);
    if (env <= 0) continue;
    var v = __jsrAudioSampleValue(st, ev, x, sampleRate);
    __jsrAudioMixSample(pcm, i * channels, v, ev.gain * env, st, channels);
    if (ev.type !== 'noise') {
      st.phase += st.frequencyNow / sampleRate;
      if (st.phase >= 1) st.phase -= Math.floor(st.phase);
    }
  }
}
function __jsrAudioEventContext(ev, sampleRate, channels){
  var detuneMul = Math.pow(2, ev.detune / 1200);
  var st = {
    attack: ev.attack * sampleRate,
    decay: ev.decay * sampleRate,
    hold: ev.duration * sampleRate,
    release: ev.release * sampleRate,
    attackDecay: ev.attack * sampleRate + ev.decay * sampleRate,
    sustain: ev.sustain,
    frequency: ev.frequency * detuneMul,
    frequencyEnd: ev.frequencyEnd * detuneMul,
    phase: 0,
    frequencyNow: 0,
    pink: [0, 0, 0, 0, 0, 0, 0],
    brown: 0,
  };
  var f = __jsrAudioFilterContext(ev, sampleRate);
  st.filter = f.filter;
  st.filterState = f.filterState;
  st.filterCoeff = f.filterCoeff;
  st.filterFrequency = f.filterFrequency;
  st.filterEnd = f.filterEnd;
  var m = __jsrAudioModContext(ev, sampleRate);
  for (var k in m) { st[k] = m[k]; }
  var panAngle = (Math.max(-1, Math.min(1, ev.pan)) + 1) * Math.PI / 4;
  st.leftGain = channels === 1 ? 1 : Math.cos(panAngle);
  st.rightGain = channels === 1 ? 0 : Math.sin(panAngle);
  return st;
}
function __jsrAudioFilterContext(ev, sampleRate){
  var filter = ev.filter;
  var filterState = filter ? { x1: 0, x2: 0, y1: 0, y2: 0 } : null;
  var filterCoeff = filter ? {} : null;
  var filterFrequency = filter ? filter.frequency : 0;
  var filterEnd = filter && filter.frequencyEnd !== null
    ? filter.frequencyEnd
    : 0;
  if (filter) {
    __jsrAudioBiquad(
      filterCoeff, filter.type, filterFrequency, filter.q, sampleRate);
  }
  return {
    filter: filter,
    filterState: filterState,
    filterCoeff: filterCoeff,
    filterFrequency: filterFrequency,
    filterEnd: filterEnd,
  };
}
function __jsrAudioModContext(ev, sampleRate){
  var vibrato = ev.vibrato;
  var tremolo = ev.tremolo;
  var fm = ev.fm;
  return {
    vibratoDepth: vibrato ? vibrato.depth : 0,
    vibratoPhase: 0,
    vibratoStep: vibrato ? vibrato.rate / sampleRate : 0,
    tremoloDepth: tremolo ? tremolo.depth : 0,
    tremoloPhase: 0,
    tremoloStep: tremolo ? tremolo.rate / sampleRate : 0,
    fmRatio: fm ? fm.ratio : 1,
    fmIndex: fm ? fm.index : 0,
    fmPhase: 0,
  };
}
function __jsrAudioEnvelopeValue(x, st){
  var env;
  if (x < st.attack) env = st.attack > 0 ? x / st.attack : 1;
  else if (x < st.attackDecay) env = 1 - (1 - st.sustain) * ((x - st.attack) / st.decay);
  else env = st.sustain;
  if (x > st.hold) {
    env = st.release > 0 ? st.sustain * (1 - (x - st.hold) / st.release) : 0;
  }
  return env;
}
function __jsrAudioSampleValue(st, ev, x, sampleRate){
  var sweepT = st.hold > 0 ? Math.min(1, x / st.hold) : 1;
  var frequencyNow = st.frequencyEnd > 0 && ev.type !== 'noise'
    ? st.frequency * Math.pow(st.frequencyEnd / st.frequency, sweepT)
    : st.frequency;
  frequencyNow = __jsrAudioVibratoTick(st, ev, frequencyNow);
  var oscPhase = __jsrAudioFmTick(st, ev, st.phase, frequencyNow, sampleRate);
  var v = ev.type === 'noise'
    ? __jsrAudioNoiseSample(st, ev.noiseColor)
    : __jsrAudioOscSample(ev.type, oscPhase);
  if (st.filter) {
    v = __jsrAudioFilterTick(st, v, sweepT, sampleRate);
  }
  if (ev.drive > 0) {
    v = __jsrAudioDriveTick(ev, v);
  }
  st.frequencyNow = frequencyNow;
  return v;
}
function __jsrAudioVibratoTick(st, ev, frequencyNow){
  if (st.vibratoDepth > 0 && ev.type !== 'noise') {
    frequencyNow *= Math.pow(2,
      st.vibratoDepth * Math.sin(st.vibratoPhase * __jsrAudioPi2) / 1200);
    st.vibratoPhase += st.vibratoStep;
    if (st.vibratoPhase >= 1) {
      st.vibratoPhase -= Math.floor(st.vibratoPhase);
    }
  }
  return frequencyNow;
}
function __jsrAudioFmTick(st, ev, oscPhase, frequencyNow, sampleRate){
  if (st.fmIndex > 0 && ev.type !== 'noise') {
    oscPhase += st.fmIndex * Math.sin(st.fmPhase * __jsrAudioPi2);
    st.fmPhase += frequencyNow * st.fmRatio / sampleRate;
    if (st.fmPhase >= 1) st.fmPhase -= Math.floor(st.fmPhase);
  }
  return oscPhase;
}
function __jsrAudioNoiseSample(st, noiseColor){
  var white = Math.random() * 2 - 1;
  if (noiseColor === 'pink') {
    var p = st.pink;
    p[0] = 0.99886 * p[0] + white * 0.0990460;
    p[1] = 0.2935 * p[1] - white * 0.2965164;
    p[2] = -1.0527 * p[2] - white * 0.0522123;
    p[3] = 0.0734 * p[3] - white * 0.016875;
    p[4] = 0.2974 * p[4] + white * 0.0919425;
    p[5] = 0.2927 * p[5] - white * 0.0034354;
    p[6] = white * 0.5362;
    return (p[0] + p[1] + p[2] + p[3] + p[4] +
        p[5] + p[6] + p[6]) * 0.11;
  } else if (noiseColor === 'brown') {
    st.brown = (st.brown + 0.02 * white) / 1.02;
    if (st.brown > 1) st.brown = 1;
    else if (st.brown < -1) st.brown = -1;
    return st.brown * 0.8;
  }
  return white;
}
function __jsrAudioOscSample(type, oscPhase){
  if (type === 'square') {
    return oscPhase < 0.5 ? 1 : -1;
  } else if (type === 'sawtooth') {
    return oscPhase * 2 - 1;
  } else if (type === 'triangle') {
    return 1 - 4 * Math.abs(oscPhase - 0.5);
  }
  return Math.sin(oscPhase * __jsrAudioPi2);
}
function __jsrAudioFilterTick(st, v, sweepT, sampleRate){
  var cutoff = st.filterEnd > 0
    ? st.filterFrequency * Math.pow(st.filterEnd / st.filterFrequency, sweepT)
    : st.filterFrequency;
  __jsrAudioBiquad(
    st.filterCoeff, st.filter.type, cutoff, st.filter.q, sampleRate);
  var input = v;
  var output = st.filterCoeff.b0 * input +
    st.filterCoeff.b1 * st.filterState.x1 +
    st.filterCoeff.b2 * st.filterState.x2 -
    st.filterCoeff.a1 * st.filterState.y1 -
    st.filterCoeff.a2 * st.filterState.y2;
  st.filterState.x2 = st.filterState.x1;
  st.filterState.x1 = input;
  st.filterState.y2 = st.filterState.y1;
  st.filterState.y1 = output;
  return output;
}
function __jsrAudioDriveTick(ev, v){
  // Bounded soft clip, normalized so unity drive leaves full scale.
  var amount = 1 + ev.drive;
  var driven = v * amount;
  var shaped = driven / (1 + Math.abs(driven));
  shaped *= (1 + amount) / amount;
  return shaped * ev.driveMix + v * (1 - ev.driveMix);
}
function __jsrAudioMixSample(pcm, base, v, g, st, channels){
  if (st.tremoloDepth > 0) {
    var trem = Math.sin(st.tremoloPhase * __jsrAudioPi2);
    g *= 1 - st.tremoloDepth * (1 - trem) / 2;
    st.tremoloPhase += st.tremoloStep;
    if (st.tremoloPhase >= 1) {
      st.tremoloPhase -= Math.floor(st.tremoloPhase);
    }
  }
  if (channels === 1) {
    pcm[base] += v * g;
  } else {
    pcm[base] += v * g * st.leftGain;
    pcm[base + 1] += v * g * st.rightGain;
  }
}
function __jsrAudioClampPcm(pcm){
  for (var s = 0; s < pcm.length; s++) {
    if (pcm[s] > 1) pcm[s] = 1;
    else if (pcm[s] < -1) pcm[s] = -1;
  }
}
