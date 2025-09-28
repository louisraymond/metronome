import assert from 'node:assert/strict';
import { st, setTempo, resetCounters } from '../app/state.js';

const baseState = JSON.parse(JSON.stringify(st));

function resetState() {
  for (const key of Object.keys(st)) {
    if (!(key in baseState)) {
      delete st[key];
      continue;
    }
    const value = baseState[key];
    if (Array.isArray(value)) {
      st[key] = [...value];
    } else if (value && typeof value === 'object') {
      st[key] = JSON.parse(JSON.stringify(value));
    } else {
      st[key] = value;
    }
  }
  for (const key of Object.keys(baseState)) {
    if (!(key in st)) {
      st[key] = baseState[key];
    }
  }
}

test('setTempo clamps bpm and adjusts scheduling horizon', () => {
  resetState();

  setTempo(500);
  assert.equal(st.bpm, 300);
  assert.equal(st.scheduleAhead, 0.18);

  setTempo(10);
  assert.equal(st.bpm, 20);
  assert.equal(st.scheduleAhead, 0.12);

  setTempo(180);
  assert.equal(st.bpm, 180);
  assert.equal(st.scheduleAhead, 0.12);
});

test('resetCounters primes beat tracking and count-in when armed', () => {
  resetState();
  st.beatsPerBar = 4;
  st.armed = true;
  st.countInBars = 3;

  resetCounters(10, 0.5);

  assert.equal(st.bars, 1);
  assert.equal(st.beats, 0);
  assert.equal(st.sinceBars, 0);
  assert.equal(st.sinceSeconds, 0);
  assert.equal(st.curBeatInBar, 3);
  assert.equal(st.nextNoteTime, 10.5);
  assert.equal(st.countInRemaining, 3);
});

test('resetCounters skips count-in when not armed', () => {
  resetState();
  st.beatsPerBar = 3;
  st.armed = false;
  st.countInBars = 4;

  resetCounters(0, 1);

  assert.equal(st.curBeatInBar, 2);
  assert.equal(st.nextNoteTime, 1);
  assert.equal(st.countInRemaining, 0);
});
