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
