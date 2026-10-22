// Short, dry machine textures: filtered data noise with a low servo body.
function synthesizeInterfaceSound(context, output, kind) {
  const profiles = {
    select: { length: .075, low: 180, end: 135, body: .012, noise: .022, filter: 2100, filterEnd: 1300 },
    open: { length: .26, low: 110, end: 58, body: .045, noise: .028, filter: 850, filterEnd: 1900 },
    close: { length: .19, low: 125, end: 68, body: .03, noise: .022, filter: 1700, filterEnd: 600 }
  };
  const profile = profiles[kind] || profiles.select;
  const start = context.currentTime;
  const end = start + profile.length;

  function envelope(level) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, end);
    gain.gain.linearRampToValueAtTime(0, end + .008);
    gain.connect(output);
    return gain;
  }

  const body = context.createOscillator();
  const bodyGain = envelope(profile.body);
  body.type = 'triangle';
  body.frequency.setValueAtTime(profile.low, start);
  body.frequency.exponentialRampToValueAtTime(profile.end, end);
  body.connect(bodyGain);
  body.start(start);
  body.stop(end + .01);
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
  filter.Q.value = .8;
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
