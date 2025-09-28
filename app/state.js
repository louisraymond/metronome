import { clamp } from './utils.js';

export const st = {
  // Tempo/meter
  bpm: 120,
  beatsPerBar: 4,
  beatUnit: 4,
  accentFirst: true,

  // Transport/Audio
  isRunning: false,
  audioCtx: null,
  nextNoteTime: 0,
  curBeatInBar: 0,

  // Counters
  bars: 1,
  beats: 0,
  sinceBars: 0,
  sinceSeconds: 0,

  // Scheduling
  lookahead: 0.025,
  scheduleAhead: 0.12,
  schedulerTimer: null,

  // Speed trainer
  startBpm: 120,
  targetBpm: 160,
  stepBpm: 4,
  dir: 'up',
  stepN: 4,
  armed: false,
  autoStop: true,
  loopMode: 'bars', // 'bars' or 'time'
  stepDurationSec: 60,

  // Count-in
  countInBars: 2,
  countInRemaining: 0,

  // Click pattern
  clickPattern: 'all', // all, 24, 1, off

  // UI cache
  leds: [],

  // MIDI accompaniment
  midi: {
    enabled: false,
    loaded: false,
    name: '',
    notes: [],
    duration: 0,
    cursor: 0,
    startTime: 0,
    volume: 0.6,
    offsetBeats: 0,
    totalBeats: 0,
    barEstimate: 0,
    timeSignature: { numerator: 4, denominator: 4 },
    anchorTime: 0,
    anchorBeat: 0,
    timeline: [],
    timelineLength: 0,
    scheduledBeats: 0,
    countInBeats: 0,
    loopBeats: 0,
    instrument: 'synth',
    sfPlayer: null,
    sfLoadPromise: null,
    sfPending: [],
    sfActive: [],
    sfLoadError: null,
  },
};

export function setTempo(bpm) {
  st.bpm = clamp(+bpm || 120, 20, 300);
  // Adjust scheduling horizon slightly at very high tempi
  st.scheduleAhead = st.bpm > 220 ? 0.18 : 0.12;
}

export function resetCounters(now, oneBeatDuration) {
  // Reset musical counters
  st.bars = 1;
  st.beats = 0;
  st.sinceBars = 0;
  st.sinceSeconds = 0;
  // Prepare so the next scheduled click is beat 1 (index 0), one beat later
  st.curBeatInBar = st.beatsPerBar - 1;
  st.nextNoteTime = (now ?? 0) + (oneBeatDuration ?? 0);
  st.countInRemaining = st.armed ? Math.max(0, st.countInBars || 0) : 0;
}
