import { clamp } from './utils.js';

const midiState = {
  gain: null,
  voices: new Set(),
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ensureMidiGain = (st) => {
  if (!st?.audioCtx) return null;
  if (!midiState.gain || midiState.gain.context !== st.audioCtx) {
    midiState.gain = st.audioCtx.createGain();
    midiState.gain.gain.value = st.midi?.volume ?? 0.6;
    midiState.gain.connect(st.audioCtx.destination);
  }
  return midiState.gain;
};

const pianoState = {
  hammerNoise: null,
};

const ensureHammerNoise = (ctx) => {
  if (pianoState.hammerNoise && pianoState.hammerNoise.sampleRate === ctx.sampleRate) return pianoState.hammerNoise;
  const duration = 0.18;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    const env = Math.exp(-t * 50);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  pianoState.hammerNoise = buffer;
  return buffer;
};

const rhodesLoader = {
  promise: null,
};

const midiNoteToName = (note) => {
  if (!Number.isFinite(note)) return 'C4';
  const octave = Math.floor(note / 12) - 1;
  const name = NOTE_NAMES[(note % 12 + 12) % 12];
  return `${name}${octave}`;
};

const ensureRhodesInstrument = (st) => {
  if (!st?.audioCtx) return Promise.reject(new Error('Audio context unavailable'));
  if (st.midi?.sfPlayer) return Promise.resolve(st.midi.sfPlayer);
  if (st.midi?.sfLoadPromise) return st.midi.sfLoadPromise;

  const loadPromise = import('https://cdn.jsdelivr.net/npm/soundfont-player@0.11.5/dist/soundfont-player.esm.js')
    .then(({ default: Soundfont }) => Soundfont.instrument(st.audioCtx, 'electric_piano_1', { soundfont: 'FluidR3_GM', gain: 0.7 }))
    .then((instrument) => {
      if (!st.midi) return instrument;
      st.midi.sfPlayer = instrument;
      st.midi.sfLoadPromise = null;
      return instrument;
    })
    .catch((err) => {
      if (st.midi) {
        st.midi.sfLoadPromise = null;
        st.midi.sfLoadError = err;
      }
      throw err;
    });

  if (st.midi) st.midi.sfLoadPromise = loadPromise;
  return loadPromise;
};

const queueSoundfontEvent = (st, event) => {
  if (!st?.midi) return;
  if (!Array.isArray(st.midi.sfPending)) st.midi.sfPending = [];
  st.midi.sfPending.push(event);
  ensureRhodesInstrument(st)
    .then((player) => {
      const ctx = st.audioCtx;
      if (!ctx) return;
      const pending = st.midi?.sfPending ?? [];
      st.midi.sfPending = [];
      pending.forEach((evt) => {
        const startTime = Math.max(evt.startTime, ctx.currentTime + 0.002);
        const duration = Math.max(0.05, evt.duration);
        try {
          const voice = player.play(midiNoteToName(evt.note), startTime, {
            duration,
            gain: clamp(evt.velocity ?? 0.6, 0, 1.2),
          });
          if (st.midi) {
            if (!Array.isArray(st.midi.sfActive)) st.midi.sfActive = [];
            st.midi.sfActive.push(voice);
          }
        } catch (err) {
          console.warn('SoundFont playback failed:', err);
        }
      });
    })
    .catch((err) => {
      if (!st.midi?.sfLoadError) console.warn('Failed to load Rhodes soundfont:', err);
      st.midi.sfLoadError = err;
      // Fallback: schedule synth voice immediately for pending events
      const fallbackEvents = st.midi?.sfPending ?? [];
      st.midi.sfPending = [];
      fallbackEvents.forEach((evt) => {
        schedulePianoVoice(st, evt.note, evt.velocityScaled ?? 80, Math.max(evt.startTime, st.audioCtx?.currentTime ?? evt.startTime), evt.duration);
      });
    });
};

const registerVoice = (voice) => {
  midiState.voices.add(voice);
  const cleanup = () => midiState.voices.delete(voice);
  voice.oscillators.forEach((osc, idx) => {
    if (idx === 0) osc.onended = cleanup;
  });
};

const buildMidiTimeline = (notes, loopBeatsHint = 0) => {
  if (!Array.isArray(notes) || notes.length === 0) return { timeline: [], loopBeats: 0 };
  let maxIndex = 0;
  const prepared = [];
  notes.forEach((note) => {
    if (!note) return;
    const startBeats = Number.isFinite(note.startBeats) ? note.startBeats : 0;
    const baseIndex = Math.max(0, Math.floor(startBeats));
    const offset = Math.max(0, startBeats - baseIndex);
    const durationBeats = Number.isFinite(note.durationBeats)
      ? Math.max(0.05, note.durationBeats)
      : 0.5;
    if (!Number.isFinite(note.note)) return;
    prepared.push({ baseIndex, offset, durationBeats, note: note.note, velocity: note.velocity ?? 64 });
    if (baseIndex > maxIndex) maxIndex = baseIndex;
  });

  const totalBeats = Math.max(loopBeatsHint, maxIndex + 1);
  const timeline = Array.from({ length: totalBeats }, () => []);
  prepared.forEach((entry) => {
    timeline[entry.baseIndex].push({
      offset: entry.offset,
      durationBeats: entry.durationBeats,
      note: entry.note,
      velocity: entry.velocity,
    });
  });
  timeline.forEach((events) => events.sort((a, b) => a.offset - b.offset));
  return { timeline, loopBeats: totalBeats };
};

const schedulePianoVoice = (st, note, velocity, start, duration) => {
  const ctx = st.audioCtx;
  if (!ctx) return;
  const output = ensureMidiGain(st);
  if (!output) return;

  const freq = 440 * 2 ** ((note - 69) / 12);
  const vel = clamp(velocity / 127 || 0.5, 0.2, 1.1);

  const fundamental = ctx.createOscillator();
  const firstHarm = ctx.createOscillator();
  const secondHarm = ctx.createOscillator();

  fundamental.type = 'sine';
  fundamental.frequency.setValueAtTime(freq, start);
  firstHarm.type = 'sine';
  firstHarm.frequency.setValueAtTime(freq * 2, start);
  firstHarm.detune.setValueAtTime(-8, start);
  secondHarm.type = 'triangle';
  secondHarm.frequency.setValueAtTime(freq * 3, start);

  const fundamentalGain = ctx.createGain();
  fundamentalGain.gain.setValueAtTime(vel * 0.85, start);
  const firstHarmGain = ctx.createGain();
  firstHarmGain.gain.setValueAtTime(vel * 0.35, start);
  const secondHarmGain = ctx.createGain();
  secondHarmGain.gain.setValueAtTime(vel * 0.2, start);

  const mix = ctx.createGain();
  mix.gain.setValueAtTime(1, start);

  fundamental.connect(fundamentalGain).connect(mix);
  firstHarm.connect(firstHarmGain).connect(mix);
  secondHarm.connect(secondHarmGain).connect(mix);

  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  const brightness = clamp(1800 + note * 22 + vel * 2800, 900, 9500);
  toneFilter.frequency.setValueAtTime(brightness, start);
  toneFilter.Q.setValueAtTime(0.9, start);

  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = 'peaking';
  bodyFilter.frequency.setValueAtTime(clamp(220 + note * 1.2, 220, 900), start);
  bodyFilter.gain.setValueAtTime(vel * 3.5, start);
  bodyFilter.Q.setValueAtTime(1.2, start);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  const attack = 0.004;
  const decay = 0.12;
  const sustain = vel * 0.35;
  const release = Math.max(0.25, duration * 1.4);
  env.gain.linearRampToValueAtTime(vel * 0.9, start + attack);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), start + decay);
  env.gain.exponentialRampToValueAtTime(0.0001, start + release);

  mix.connect(toneFilter).connect(bodyFilter).connect(env).connect(output);

  const hammerSource = ctx.createBufferSource();
  hammerSource.buffer = ensureHammerNoise(ctx);
  hammerSource.playbackRate.setValueAtTime(clamp(1 + (note - 60) * 0.01, 0.7, 1.4), start);
  const hammerGain = ctx.createGain();
  hammerGain.gain.setValueAtTime(0.0001, start);
  hammerGain.gain.linearRampToValueAtTime(vel * 0.18, start + 0.004);
  hammerGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
  hammerSource.connect(hammerGain).connect(bodyFilter);

  const stopTime = start + release + 0.1;
  fundamental.start(start);
  firstHarm.start(start);
  secondHarm.start(start);
  hammerSource.start(start);
  fundamental.stop(stopTime);
  firstHarm.stop(stopTime);
  secondHarm.stop(stopTime);
  hammerSource.stop(start + 0.2);

  registerVoice({ oscillators: [fundamental, firstHarm, secondHarm, hammerSource], env, stopTime });
};

export function computeNoteTime({ noteBeat, offsetBeats = 0, anchorTime, secPerBeat }) {
  if (!Number.isFinite(anchorTime) || !Number.isFinite(secPerBeat) || secPerBeat <= 0) return null;
  const base = Number.isFinite(noteBeat) ? noteBeat : 0;
  const offset = Number.isFinite(offsetBeats) ? offsetBeats : 0;
  const totalBeats = base + offset;
  if (!Number.isFinite(totalBeats)) return null;
  return anchorTime + totalBeats * secPerBeat;
}

export function initAudio(st) {
  if (st.audioCtx) return;
  const C = window.AudioContext || window.webkitAudioContext;
  st.audioCtx = new C();
}

export function scheduleClick(ctx, t, accent, mode = 'normal') {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);

  if (mode === 'countin') {
    const a = accent ? 0.95 : 0.65;
    g.gain.linearRampToValueAtTime(a, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1000 : 700, t);
  } else {
    // Normal click (square)
    g.gain.linearRampToValueAtTime(accent ? 0.9 : 0.5, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.type = 'square';
    osc.frequency.setValueAtTime(accent ? 1800 : 1200, t);
  }

  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + (mode === 'countin' ? 0.09 : 0.07));
}

export function setMidiTrack(st, data) {
  if (!st?.midi) return;
  st.midi.notes = data?.notes ?? [];
  st.midi.duration = data?.duration ?? 0;
  st.midi.loaded = st.midi.notes.length > 0;
  st.midi.name = data?.name ?? '';
  st.midi.cursor = 0;
  st.midi.startTime = 0;
  st.midi.offsetBeats = 0;
  st.midi.totalBeats = data?.totalBeats ?? 0;
  st.midi.barEstimate = data?.barEstimate ?? 0;
  st.midi.timeSignature = data?.timeSignature ?? { numerator: 4, denominator: 4 };
  st.midi.anchorTime = 0;
  st.midi.anchorBeat = 0;
  const { timeline, loopBeats } = buildMidiTimeline(st.midi.notes, Math.max(1, Math.ceil(data?.totalBeats ?? 0)));
  st.midi.timeline = timeline;
  st.midi.timelineLength = timeline.length;
  st.midi.loopBeats = loopBeats;
  st.midi.scheduledBeats = 0;
  st.midi.countInBeats = st.midi.offsetBeats ?? 0;
  st.midi.sfPending = [];
}

export function clearMidi(st) {
  if (!st?.midi) return;
  st.midi.notes = [];
  st.midi.duration = 0;
  st.midi.loaded = false;
  st.midi.name = '';
  st.midi.cursor = 0;
  st.midi.startTime = 0;
  st.midi.offsetBeats = 0;
  st.midi.totalBeats = 0;
  st.midi.barEstimate = 0;
  st.midi.timeSignature = { numerator: 4, denominator: 4 };
  st.midi.anchorTime = 0;
  st.midi.anchorBeat = 0;
  st.midi.timeline = [];
  st.midi.timelineLength = 0;
  st.midi.scheduledBeats = 0;
  st.midi.countInBeats = 0;
  st.midi.loopBeats = 0;
  st.midi.loaded = false;
  st.midi.sfPending = [];
}

export function setMidiEnabled(st, enabled) {
  if (!st?.midi) return;
  st.midi.enabled = !!enabled;
  if (!st.midi.enabled) stopMidi(st);
}

export function setMidiVolume(st, vol) {
  if (!st?.midi) return;
  const value = clamp(+vol || 0, 0, 1);
  st.midi.volume = value;
  const gain = ensureMidiGain(st);
  if (gain) gain.gain.setValueAtTime(value, st.audioCtx.currentTime);
}

export function resetMidiPlayback(st, beatDuration) {
  if (!st?.midi?.loaded || !st.midi.enabled || !st.audioCtx) return;
  ensureMidiGain(st);
  st.midi.cursor = 0;
  st.midi.anchorTime = st.nextNoteTime;
  st.midi.anchorBeat = st.beats;
  const beatsPerBar = Math.max(1, st.beatsPerBar || 1);
  const countInBars = st.armed ? Math.max(0, st.countInBars || 0) : 0;
  st.midi.offsetBeats = countInBars * beatsPerBar;
  st.midi.lastSecPerBeat = beatDuration;
  st.midi.countInBeats = st.midi.offsetBeats;
  st.midi.scheduledBeats = 0;
}

export function reanchorMidiPlayback(st, beatDuration) {
  if (!st?.midi?.loaded || !st.midi.enabled || !st.audioCtx) return;
  ensureMidiGain(st);
  st.midi.anchorTime = st.nextNoteTime;
  st.midi.anchorBeat = st.beats;
  st.midi.lastSecPerBeat = beatDuration;
  if (!Number.isFinite(st.midi.countInBeats)) st.midi.countInBeats = st.midi.offsetBeats ?? 0;
}

export function scheduleBeatMidi(st, beatStartTime, secPerBeatValue) {
  if (!st?.midi?.loaded || !st.midi.enabled || !st.audioCtx) return [];
  if (!Number.isFinite(beatStartTime) || !Number.isFinite(secPerBeatValue) || secPerBeatValue <= 0) return [];
  const midi = st.midi;
  const beatNumber = midi.scheduledBeats ?? 0;
  const countInBeats = midi.countInBeats ?? 0;
  const loopBeats = midi.loopBeats ?? midi.timelineLength ?? 0;
  let timelineIndex = beatNumber - countInBeats;
  const scheduled = [];

  if (timelineIndex < 0) {
    midi.scheduledBeats = beatNumber + 1;
    return scheduled;
  }

  let wrappedIndex = timelineIndex;
  if (loopBeats > 0) {
    wrappedIndex = timelineIndex % loopBeats;
  }
  if (wrappedIndex < 0) wrappedIndex = 0;

  if (Array.isArray(midi.timeline) && midi.timeline.length > 0) {
    const index = loopBeats > 0 ? wrappedIndex % midi.timeline.length : wrappedIndex;
    const events = midi.timeline[index] ?? [];
    if (events?.length) {
      events.forEach((event) => {
        const offset = Math.max(0, event.offset ?? 0);
        const startTime = beatStartTime + offset * secPerBeatValue;
        const durBeats = Math.max(0.05, event.durationBeats ?? 0.5);
        const durationSec = durBeats * secPerBeatValue;
        const velocity = event.velocity ?? 64;
        const velocityNorm = clamp((velocity || 64) / 127, 0.1, 1.2);
        const instrument = midi.instrument || 'synth';
        if (instrument === 'rhodes') {
          queueSoundfontEvent(st, {
            note: event.note,
            startTime,
            duration: durationSec,
            velocity: velocityNorm,
            velocityScaled: velocity,
          });
        } else {
          schedulePianoVoice(st, event.note, velocity, startTime, durationSec);
        }
        scheduled.push({
          note: event.note,
          velocity,
          offset,
          startTime,
          duration: durationSec,
          timelineIndex,
        });
      });
    }
  }

  midi.scheduledBeats = beatNumber + 1;
  return scheduled;
}

export function stopMidi(st, opts = {}) {
  const preserveProgress = !!opts.preserveProgress;
  if (!st?.audioCtx) {
    midiState.voices.clear();
    if (!preserveProgress && st?.midi) {
      st.midi.cursor = 0;
      st.midi.startTime = 0;
      st.midi.scheduledBeats = 0;
      st.midi.sfPlayer = null;
      st.midi.sfLoadPromise = null;
      st.midi.sfPending = [];
      st.midi.sfActive = [];
      st.midi.sfLoadError = null;
    }
    return;
  }
  const now = st.audioCtx.currentTime;
  midiState.voices.forEach((voice) => {
    try {
      voice.env.gain.cancelScheduledValues(now);
      voice.env.gain.setValueAtTime(voice.env.gain.value || 0, now);
      voice.env.gain.linearRampToValueAtTime(0.0001, now + 0.05);
      voice.oscillators.forEach((osc) => {
        try {
          osc.stop(now + 0.06);
        } catch (_) {}
      });
    } catch (_) {}
  });
  midiState.voices.clear();
  if (st.midi) {
    if (Array.isArray(st.midi.sfActive)) {
      st.midi.sfActive.forEach((voice) => {
        try {
          voice.stop(now);
        } catch (_) {}
      });
      st.midi.sfActive = [];
    }
    if (!preserveProgress) {
      st.midi.sfPlayer = null;
      st.midi.sfLoadPromise = null;
      st.midi.sfPending = [];
      st.midi.sfLoadError = null;
    }
    if (!preserveProgress) {
      st.midi.cursor = 0;
      st.midi.startTime = 0;
      st.midi.scheduledBeats = 0;
    }
  }
}

export function teardownMidiNodes() {
  midiState.gain = null;
  midiState.voices.clear();
}

export function preloadSoundfontInstrument(st, id) {
  if (id === 'rhodes') {
    ensureRhodesInstrument(st).catch(() => {});
  }
}
