// CRAP override for __jsrAudioApplyReverb (reference CC 8): the comb bank
// setup and the per-frame inner loop become helpers. The sample processing
// is mathematically identical (same comb bank, same one-pole diffuser).
function __jsrAudioApplyReverb(pcm, sampleRate, channels, ef){
  // Small parallel comb bank plus a one-pole diffuser: cheap enough for a
  // widget-sized offline render, and bounded by the mix/feedback ranges.
  var banks = __jsrAudioReverbBanks(channels, sampleRate, ef);
  var diffusers = [];
  var diffuserPositions = [];
  for (var channel = 0; channel < channels; channel++) {
    diffusers.push(new Float32Array(Math.max(2, Math.round(0.005 * sampleRate))));
    diffuserPositions.push(0);
  }
  for (var frame = 0; frame < pcm.length; frame += channels) {
    for (var channelAt = 0; channelAt < channels; channelAt++) {
      __jsrAudioReverbFrame(pcm, frame, channelAt, channels, ef, banks, diffusers, diffuserPositions);
    }
  }
}
// jsr-append-top-level
function __jsrAudioReverbBanks(channels, sampleRate, ef){
  var combSeconds = [0.023, 0.0297, 0.0371, 0.0411];
  var combs = combSeconds.length;
  var buffers = [];
  var positions = [];
  var gains = [];
  for (var ch = 0; ch < channels; ch++) {
    for (var c = 0; c < combs; c++) {
      var samples = Math.max(2, Math.round(combSeconds[c] * sampleRate));
      // Tiny per-channel offsets keep stereo decorrelated without a second IR.
      if (ch > 0) samples += ch * 7 + c;
      buffers.push(new Float32Array(samples));
      positions.push(0);
      gains.push(Math.min(0.9, Math.pow(0.001, combSeconds[c] / ef.decay)));
    }
  }
  return { combs: combs, buffers: buffers, positions: positions, gains: gains };
}
function __jsrAudioReverbFrame(pcm, frame, channelAt, channels, ef, banks, diffusers, diffuserPositions){
  var at = frame + channelAt;
  var input = pcm[at];
  var wet = 0;
  for (var combAt = 0; combAt < banks.combs; combAt++) {
    // Buffers are channel-major; the four combs follow their channel.
    var index = channelAt * banks.combs + combAt;
    var buffer = banks.buffers[index];
    var pos = banks.positions[index];
    var delayed = buffer[pos];
    buffer[pos] = input + delayed * banks.gains[index];
    banks.positions[index] = (pos + 1) % buffer.length;
    wet += delayed;
  }
  wet /= banks.combs;
  var diffuser = diffusers[channelAt];
  var diffuserPos = diffuserPositions[channelAt];
  var diffused = diffuser[diffuserPos];
  diffuser[diffuserPos] = wet * 0.5 + diffused * 0.5;
  diffuserPositions[channelAt] = (diffuserPos + 1) % diffuser.length;
  pcm[at] = input * (1 - ef.mix) + diffused * ef.mix;
}
