const interfaceCueFiles = {
  startup: 'assets/audio/mixkit-startup.mp3',
  open: 'assets/audio/mixkit-open.mp3',
  close: 'assets/audio/mixkit-close.mp3',
  select: 'assets/audio/interface-tap.mp3'
};
const fallbackTransition = 'assets/audio/interface-glide.mp3';

const localSoundFiles = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
const mixkitRoot = 'https://assets.mixkit.co/active_storage/sfx/';
const mixkitCues = {
  startup: { id: 914, offset: .09, duration: .93 },
  open: { id: 901, offset: .09, duration: .62 },
  close: { id: 3114, offset: .065, duration: .565 }
};

function playInterfaceCue(context, output, buffer, kind, offset = 0, duration) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  const levels = { startup: .13, open: .11, close: .13, select: .07 };
  gain.gain.value = levels[kind];
  source.connect(gain).connect(output);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  if (duration === undefined) source.start(0, offset);
  else source.start(0, offset, duration);
}

function createInterfaceSound() {
  let context;
  let output;
  const buffers = new Map();
  let playbackGeneration = 0;
  let lastPlay = -Infinity;

  function load(file, optional = false) {
    if (!buffers.has(file)) {
      buffers.set(file, fetch(file, { credentials: 'omit' }).then(async response => {
        if (optional && response.status === 404) return null;
        if (!response.ok) throw new Error('Interface sound unavailable');
        return context.decodeAudioData(await response.arrayBuffer());
      }).catch(error => {
        buffers.delete(file);
        throw error;
      }));
    }
    return buffers.get(file);
  }

  async function loadCue(kind) {
    if (kind === 'select') return { buffer: await load(interfaceCueFiles.select) };
    if (localSoundFiles) {
      const local = await load(interfaceCueFiles[kind], true).catch(() => null);
      return { buffer: local || await load(fallbackTransition) };
    }
    const { id, offset, duration } = mixkitCues[kind];
    const buffer = await load(`${mixkitRoot}${id}/${id}-preview.mp3`).catch(() => null);
    return buffer ? { buffer, offset, duration } : null;
  }

  return {
    async prepare() {
      context ??= new AudioContext();
      await Promise.allSettled(Object.keys(interfaceCueFiles).map(loadCue));
    },
    async play(kind, automatic = false) {
      if (document.hidden) return false;
      const generation = playbackGeneration;
      context ??= new AudioContext();
      if (automatic && context.state !== 'running') return false;
      const resumed = context.state === 'suspended' ? context.resume() : undefined;
      const [, cue] = await Promise.all([resumed, loadCue(kind)]);
      if (!cue || generation !== playbackGeneration || document.hidden || context.currentTime - lastPlay < .045) return false;
      if (!output) {
        output = context.createGain();
        output.connect(context.destination);
      }
      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setTargetAtTime(1, context.currentTime, .005);
      lastPlay = context.currentTime;
      playInterfaceCue(context, output, cue.buffer, kind, cue.offset, cue.duration);
      return true;
    },
    silence() {
      playbackGeneration++;
      if (context && output) output.gain.setTargetAtTime(0, context.currentTime, .005);
    }
  };
}
