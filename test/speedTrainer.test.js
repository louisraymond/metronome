import assert from 'node:assert/strict';
import { considerStep, estimateDrillDuration } from '../app/speedTrainer.js';

test('considerStep ignores state when trainer is not armed', () => {
  const state = {
    armed: false,
    countInRemaining: 0,
    loopMode: 'bars',
    sinceBars: 4,
    sinceSeconds: 0,
  };

  const result = considerStep(state, { setTempo: () => {} });
  assert.deepEqual(result, { changed: false });
});

test('considerStep skips stepping during count-in', () => {
  const state = {
    armed: true,
    countInRemaining: 1,
    loopMode: 'bars',
    sinceBars: 10,
    sinceSeconds: 0,
  };

  const result = considerStep(state, { setTempo: () => {} });
  assert.deepEqual(result, { changed: false });
});

test('considerStep advances tempo after required bars', () => {
  const applied = [];
  const state = {
    armed: true,
    countInRemaining: 0,
    loopMode: 'bars',
    sinceBars: 2,
    sinceSeconds: 0,
    stepN: 2,
    stepDurationSec: 30,
    dir: 'up',
    stepBpm: 5,
    bpm: 120,
    targetBpm: 140,
    autoStop: true,
    curBeatInBar: 1,
  };

  const result = considerStep(state, {
    setTempo: (bpm) => applied.push(bpm),
  });

  assert.equal(applied.length, 1);
  assert.equal(applied[0], 125);
  assert.deepEqual(result, { changed: true, reached: false, disarmed: false });
  assert.equal(state.sinceBars, 0);
  assert.equal(state.sinceSeconds, 0);
});

test('considerStep disarms and stops when reaching target', () => {
  let stopped = false;
  let disarmed = false;
  const applied = [];
  const state = {
    armed: true,
    countInRemaining: 0,
    loopMode: 'bars',
    sinceBars: 4,
    sinceSeconds: 0,
    stepN: 2,
    stepDurationSec: 30,
    dir: 'up',
    stepBpm: 10,
    bpm: 150,
    targetBpm: 155,
    autoStop: true,
    curBeatInBar: 0,
  };

  const result = considerStep(state, {
    setTempo: (bpm) => applied.push(bpm),
    stop: () => {
      stopped = true;
    },
    onDisarm: () => {
      disarmed = true;
    },
  });

  assert.equal(applied[0], 155);
  assert.equal(state.armed, false);
  assert.equal(stopped, true);
  assert.equal(disarmed, true);
  assert.deepEqual(result, { changed: true, reached: true, disarmed: true });
});

test('estimateDrillDuration returns infinity when autoStop is disabled', () => {
  const state = {
    autoStop: false,
  };
  const estimate = estimateDrillDuration(state);
  assert.equal(estimate.totalSeconds, Infinity);
  assert.equal(estimate.segments, Infinity);
});

test('estimateDrillDuration sums time segments for time-based loops', () => {
  const state = {
    autoStop: true,
    beatsPerBar: 4,
    beatUnit: 4,
    startBpm: 120,
    targetBpm: 140,
    stepBpm: 10,
    countInBars: 1,
    loopMode: 'time',
    stepDurationSec: 30,
    stepN: 2,
    dir: 'up',
  };

  const estimate = estimateDrillDuration(state);
  assert.equal(estimate.segments, 2);
  assert.equal(estimate.totalSeconds, 62);
});

