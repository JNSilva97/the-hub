// Metallic scanner sweeps and filtered data noise, without a bass impact.
function synthesizeInterfaceSound(context, output, kind) {
  const profiles = {
    select: { length: .075, frequency: 2200, end: 1800, depth: 180, body: .014, noise: .025, filter: 3400, filterEnd: 2400 },
    open: { length: .26, frequency: 1050, end: 2100, depth: 480, body: .022, noise: .035, filter: 1600, filterEnd: 4200 },
    close: { length: .19, frequency: 2100, end: 1050, depth: 360, body: .018, noise: .03, filter: 4200, filterEnd: 1800 }
  };
  const profile = profiles[kind] || profiles.select;
  const start = context.currentTime;
  const end = start + profile.length;

  function envelope(level) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, end);
    gain.gain.linearRampToValueAtTime(0, end + .008);
    gain.connect(output);
    return gain;
  }

  const body = context.createOscillator();
  const bodyGain = envelope(profile.body);
  const modulator = context.createOscillator();
  const modulation = context.createGain();
  body.type = 'sine';
  body.frequency.setValueAtTime(profile.frequency, start);
  body.frequency.exponentialRampToValueAtTime(profile.end, end);
  // An inharmonic sideband gives the sweep a metallic texture instead of a musical note.
  modulator.frequency.setValueAtTime(profile.frequency * Math.SQRT2, start);
  modulator.frequency.exponentialRampToValueAtTime(profile.end * Math.SQRT2, end);
  modulation.gain.setValueAtTime(profile.depth, start);
  modulation.gain.exponentialRampToValueAtTime(25, end);
  modulator.connect(modulation).connect(body.frequency);
  body.connect(bodyGain);
  modulator.start(start);
  body.start(start);
  body.stop(end + .01);
  modulator.stop(end + .01);
  modulator.onended = () => { modulator.disconnect(); modulation.disconnect(); };
  body.onended = () => { body.disconnect(); bodyGain.disconnect(); };

  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * (profile.length + .01)), context.sampleRate);
  const samples = buffer.getChannelData(0);
  // A fixed noise seed keeps the texture consistent between clicks and devices.
  let seed = 173;
  for (let i = 0; i < samples.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    samples[i] = (seed >>> 0) / 2147483648 - 1;
  }
  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const noiseGain = envelope(profile.noise);
  filter.type = 'bandpass';
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(profile.filter, start);
  filter.frequency.exponentialRampToValueAtTime(profile.filterEnd, end);
  noise.buffer = buffer;
  noise.connect(filter).connect(noiseGain);
  noise.start(start);
  noise.stop(end + .01);
  noise.onended = () => { noise.disconnect(); filter.disconnect(); noiseGain.disconnect(); };
}

function createInterfaceSound() {
  let context;
  let output;
  let muted = true;
  let lastPlay = -Infinity;
  return {
    async play(kind) {
      muted = false;
      context ??= new AudioContext();
      if (context.state === 'suspended') await context.resume();
      if (muted || document.hidden || context.currentTime - lastPlay < .045) return;
      output ??= context.createGain();
      if (lastPlay === -Infinity) output.connect(context.destination);
      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setTargetAtTime(1, context.currentTime, .005);
      lastPlay = context.currentTime;
      synthesizeInterfaceSound(context, output, kind);
    },
    silence() {
      muted = true;
      if (context && output) output.gain.setTargetAtTime(0, context.currentTime, .005);
    }
  };
}
