import { clamp } from './utils.js';

// Single source of truth for app state
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

  // Count-in
  countInBars: 2,
  countInRemaining: 0,

  // Click pattern
  clickPattern: 'all', // all, 24, 1, off

  // UI cache
  leds: [],
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
  // Prepare so the next scheduled click is beat 1 (index 0), one beat later
  st.curBeatInBar = st.beatsPerBar - 1;
  st.nextNoteTime = (now ?? 0) + (oneBeatDuration ?? 0);
  st.countInRemaining = st.armed ? Math.max(0, st.countInBars || 0) : 0;
}

