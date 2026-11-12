const interfaceCueFiles = {
  startup: 'assets/audio/mixkit-startup.mp3',
  open: 'assets/audio/mixkit-open.mp3',
  close: 'assets/audio/mixkit-close.mp3',
  select: 'assets/audio/interface-tap.mp3'
};
const fallbackTransition = 'assets/audio/interface-glide.mp3';

function playInterfaceCue(context, output, buffer, kind) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  const levels = { startup: .13, open: .11, close: .13, select: .07 };
  gain.gain.value = levels[kind];
  source.connect(gain).connect(output);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  source.start();
}

function createInterfaceSound() {
  let context;
  let output;
  const buffers = new Map();
  let playbackGeneration = 0;
  let lastPlay = -Infinity;

  function load(file, optional = false) {
    if (!buffers.has(file)) {
      buffers.set(file, fetch(file).then(async response => {
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

  return {
    async play(kind, automatic = false) {
      if (document.hidden) return false;
      const generation = playbackGeneration;
      context ??= new AudioContext();
      if (automatic && context.state !== 'running') return false;
      const resumed = context.state === 'suspended' ? context.resume() : undefined;
      const requested = load(interfaceCueFiles[kind], kind !== 'select');
      const cue = kind === 'select' ? requested : requested.catch(() => null).then(buffer => buffer || load(fallbackTransition));
      const [, buffer] = await Promise.all([resumed, cue]);
      if (generation !== playbackGeneration || document.hidden || context.currentTime - lastPlay < .045) return false;
      if (!output) {
        output = context.createGain();
        output.connect(context.destination);
      }
      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setTargetAtTime(1, context.currentTime, .005);
      lastPlay = context.currentTime;
      playInterfaceCue(context, output, buffer, kind);
      return true;
    },
    silence() {
      playbackGeneration++;
      if (context && output) output.gain.setTargetAtTime(0, context.currentTime, .005);
    }
  };
}
