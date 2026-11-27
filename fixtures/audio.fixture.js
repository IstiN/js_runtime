// API group fixture: offline audio synthesis (deterministic: seeded
// Math.random is not needed — this track uses no noise oscillator).
var track = jsr.audio
  .synth({ sampleRate: 8000, channels: 1, duration: 0.02 })
  .osc({
    type: 'sine',
    frequency: 440,
    duration: 0.015,
    attack: 0.002,
    release: 0.004,
    gain: 0.9,
    drive: 2,
    driveMix: 0.5,
    vibrato: { rate: 5, depth: 20 },
    filter: { type: 'lowpass', frequency: 1200, frequencyEnd: 400 },
  })
  .osc({
    type: 'square',
    frequency: 220,
    start: 0.005,
    duration: 0.01,
    gain: 0.4,
    fm: { ratio: 2, index: 3 },
  });
track.render();
