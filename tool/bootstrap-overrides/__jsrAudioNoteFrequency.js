// CRAP override for __jsrAudioNoteFrequency (reference CC 13): the numeric
// path and the note-name path split, accidentals move to their own helper.
// Error messages and returned frequencies are identical.
function __jsrAudioNoteFrequency(note){
  if (typeof note === 'number') return __jsrAudioFreqHz(note);
  var m = /^\s*([A-Ga-g])\s*([#bB]?)\s*(-?\d{1,2})\s*$/.exec(String(note));
  if (!m) throw new Error('audio.synth: unsupported note name "' + note + '"');
  var midi = __jsrAudioSemitones(m);
  if (midi < 0 || midi > 127) {
    throw new Error('audio.synth: note is outside MIDI range 0..127');
  }
  return 440 * Math.pow(2, (midi - 69) / 12);
}
// jsr-append-top-level
function __jsrAudioFreqHz(note){
  if (isFinite(note) && note > 0 && note <= 20000) return note;
  throw new Error('audio.synth: note frequency must be 1..20000 Hz');
}
function __jsrAudioSemitones(m){
  var semis = {c:0, d:2, e:4, f:5, g:7, a:9, b:11};
  var midi = (parseInt(m[3], 10) + 1) * 12 + semis[m[1].toLowerCase()];
  if (m[2] === '#' || m[2] === '\u266f') midi++;
  if (m[2] === 'b' || m[2] === 'B' || m[2] === '\u266d') midi--;
  return midi;
}
