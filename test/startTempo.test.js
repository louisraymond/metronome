import assert from 'node:assert/strict';

const originalDocument = globalThis.document;

test('start applies armed tempo and syncs UI immediately', async () => {
  globalThis.document = {
    readyState: 'loading',
    addEventListener: () => {},
  };

  try {
    await import('../app/main.js');
    const __createAppForTest = globalThis.__createAppForTest;

    assert.strictEqual(typeof __createAppForTest, 'function', '__createAppForTest helper missing');

    const st = {
      bpm: 120,
      beatUnit: 4,
      beatsPerBar: 4,
      countInBars: 0,
      scheduleAhead: 0,
      lookahead: 0,
      nextNoteTime: 0,
      countInRemaining: 0,
      curBeatInBar: 0,
      accentFirst: true,
      clickPattern: 'all',
      beats: 0,
      bars: 1,
      sinceBars: 0,
      sinceSeconds: 0,
      armed: false,
      audioCtx: null,
      leds: [],
      midi: {
        enabled: false,
        loaded: false,
        notes: [],
        duration: 0,
        cursor: 0,
        startTime: 0,
        volume: 0.6,
        offsetBeats: 0,
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

    const syncCalls = [];

    const app = __createAppForTest({
      stateMod: {
        st,
        setTempo: (bpm) => {
          st.bpm = bpm;
        },
        resetCounters: () => {
          st.nextNoteTime = Number.POSITIVE_INFINITY;
        },
      },
      audioMod: {
        initAudio: (state) => {
          state.audioCtx = state.audioCtx || { currentTime: 0 };
        },
        scheduleClick: () => {},
        setMidiTrack: () => {},
        clearMidi: () => {},
        setMidiEnabled: () => {},
        setMidiVolume: () => {},
        resetMidiPlayback: () => {},
        reanchorMidiPlayback: () => {},
        scheduleBeatMidi: () => {},
        stopMidi: () => {},
        teardownMidiNodes: () => {},
      },
      speedMod: {
        considerStep: () => {},
      },
      uiMod: {
        bindUI: () => ({
          syncTempoUI: () => {
            syncCalls.push(st.bpm);
          },
          renderMeter: () => {},
          syncStepUI: () => {},
          onBeat: () => {},
          onKPIs: () => {},
          renderArmState: () => {},
          updateDrillEstimate: () => {},
        }),
      },
    });

    st.armed = true;
    st.startBpm = 132;

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = () => 0;
    globalThis.clearTimeout = () => {};

    const beforeStart = syncCalls.length;
    try {
      app.start();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }

    assert.ok(syncCalls.length > beforeStart, 'tempo UI should sync immediately when armed');
    assert.strictEqual(st.bpm, 132);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('stop resets counters so restart begins on beat one', async () => {
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const prevFetch = globalThis.fetch;

  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    readyState: 'complete',
  };

  globalThis.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    location: { search: '' },
  };

  globalThis.fetch = () => Promise.reject(new Error('no fetch in test'));

  await import('../app/main.js');
  const createApp = globalThis.__createAppForTest;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const createStateMod = () => {
    const st = {
      bpm: 120,
      beatUnit: 4,
      beatsPerBar: 4,
      accentFirst: true,
      clickPattern: 'all',
      countInBars: 0,
      countInRemaining: 0,
      lookahead: 0.025,
      scheduleAhead: 0.12,
      nextNoteTime: 0,
      curBeatInBar: 0,
      bars: 1,
      beats: 0,
      sinceBars: 0,
      sinceSeconds: 0,
      isRunning: false,
      armed: false,
      leds: [],
      audioCtx: null,
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

    const setTempo = (bpm) => {
      const next = clamp(Math.round(+bpm || 120), 20, 300);
      st.bpm = next;
      st.scheduleAhead = st.bpm > 220 ? 0.18 : 0.12;
    };

    const resetCounters = (now = 0, oneBeatDuration = 0.5) => {
      st.bars = 1;
      st.beats = 0;
      st.sinceBars = 0;
      st.sinceSeconds = 0;
      st.curBeatInBar = Math.max(0, (st.beatsPerBar || 4) - 1);
      st.nextNoteTime = (now ?? 0) + (oneBeatDuration ?? 0);
      st.countInRemaining = st.armed ? Math.max(0, st.countInBars || 0) : 0;
    };

    return { st, setTempo, resetCounters };
  };

  const stateMod = createStateMod();
  const onBeatEvents = [];

  const audioMod = {
    initAudio: (state) => {
      state.audioCtx = state.audioCtx || { currentTime: 1 };
    },
    scheduleClick: () => {},
    setMidiTrack: () => {},
    clearMidi: () => {},
    setMidiEnabled: () => {},
    setMidiVolume: () => {},
    resetMidiPlayback: () => {},
    reanchorMidiPlayback: () => {},
    scheduleBeatMidi: () => [],
    stopMidi: () => {},
    teardownMidiNodes: () => {},
    preloadSoundfontInstrument: () => {},
  };

  const speedMod = { considerStep: () => {} };

  const uiMod = {
    bindUI: () => ({
      syncTempoUI: () => {},
      renderMeter: () => {},
      syncStepUI: () => {},
      onBeat: (beat, accent) => {
        onBeatEvents.push({ beat, accent });
      },
      onKPIs: () => {},
      renderArmState: () => {},
      updateDrillEstimate: () => {},
      renderMidiStatus: () => {},
      syncMidiControls: () => {},
      syncMidiInstrument: () => {},
      refreshMidiTiming: () => {},
      syncMidiLibrary: () => {},
    }),
  };

  const routerMod = {};
  const practicePlansMod = {};
  const practicePlansViewMod = {};
  const practiceQueueMod = {};
  const practiceSessionViewMod = {};
  const menuControllerMod = {};

  const app = createApp({
    stateMod,
    audioMod,
    speedMod,
    uiMod,
    routerMod,
    practicePlansMod,
    practicePlansViewMod,
    practiceQueueMod,
    practiceSessionViewMod,
    menuControllerMod,
  });

  stateMod.st.countInBars = 2;
  stateMod.st.armed = true;

  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = () => 0;
  globalThis.clearTimeout = () => {};

  try {
    app.start();

    stateMod.st.curBeatInBar = 2;
    stateMod.st.beats = 9;
    stateMod.st.bars = 4;

    app.stop();

    assert.equal(stateMod.st.bars, 1);
    assert.equal(stateMod.st.beats, 0);
    assert.equal(stateMod.st.curBeatInBar, stateMod.st.beatsPerBar - 1);
    assert.equal(stateMod.st.countInRemaining, Math.max(0, stateMod.st.countInBars));

    const eventsAfterStop = onBeatEvents.length;

    app.start();

    const restartEvents = onBeatEvents.slice(eventsAfterStop);
    assert.ok(restartEvents.length > 0, 'restart should emit a beat event');
    assert.equal(restartEvents[0].beat, 0);
    assert.equal(restartEvents[0].accent, true);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    if (prevDocument === undefined) delete globalThis.document;
    else globalThis.document = prevDocument;
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
    if (prevFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = prevFetch;
  }
});
