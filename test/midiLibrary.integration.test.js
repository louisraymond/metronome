import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

test('built-in MIDI selection auto-enables accompaniment', async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  const stubDocument = {
    readyState: 'loading',
    addEventListener: () => {},
  };
  globalThis.document = stubDocument;

  const storageMap = new Map();
  const stubStorage = {
    getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
    setItem: (key, value) => {
      storageMap.set(key, String(value));
    },
    removeItem: (key) => {
      storageMap.delete(key);
    },
  };

  globalThis.window = {
    localStorage: stubStorage,
    location: { search: '' },
  };

  const rootDir = process.cwd();
  globalThis.fetch = (url) => {
    const normalised = url.startsWith('./') ? url.slice(2) : url;
    const filePath = path.join(rootDir, normalised);
    const buffer = readFileSync(filePath);
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
    });
  };

  await import('../app/main.js');
  const createApp = globalThis.__createAppForTest;

  const stateMod = await import('../app/state.js');
  const audioMod = await import('../app/audio.js');
  const speedMod = await import('../app/speedTrainer.js');

  const captured = {
    status: null,
    selected: null,
    syncCalls: 0,
  };

  const uiMod = {
    bindUI: (st, api) => {
      captured.api = api;
      return {
        syncTempoUI: () => {},
        syncStepUI: () => {},
        renderArmState: () => {},
        updateDrillEstimate: () => {},
        renderMeter: () => {},
        syncMidiControls: () => {
          captured.syncCalls += 1;
        },
        syncMidiLibrary: (id) => {
          captured.selected = id;
        },
        renderMidiStatus: (msg) => {
          captured.status = msg;
        },
        syncMidiInstrument: () => {},
        refreshMidiTiming: () => {},
        onBeat: () => {},
        onKPIs: () => {},
      };
    },
  };

  const practicePlansMod = {
    loadPlans: () => Promise.resolve([]),
    exportCurrentPlan: () => {},
    saveUserPlan: () => {},
    deleteUserPlan: () => {},
  };

  const practicePlansViewMod = {
    createPracticePlansView: () => ({
      setPlans: () => {},
      selectPlan: () => {},
    }),
  };

  const practiceQueueMod = {
    createPracticeQueue: () => ({
      loadPlan: () => {},
      getProgress: () => null,
      completeActive: () => {},
      skipActive: () => {},
      goTo: () => {},
      reset: () => {},
    }),
  };

  const practiceSessionViewMod = {
    createPracticeSessionView: () => ({
      render: () => {},
      setIdle: () => {},
    }),
  };

  const menuControllerMod = {
    attachMenuController: () => null,
  };

  createApp({
    stateMod,
    audioMod,
    speedMod,
    uiMod,
    routerMod: {},
    practicePlansMod,
    practicePlansViewMod,
    practiceQueueMod,
    practiceSessionViewMod,
    menuControllerMod,
  });

  await new Promise((resolve) => setImmediate(resolve));

  const { st } = stateMod;
  assert.equal(st.midi.enabled, false);

  await captured.api.loadBuiltInMidi('diatonic-circle-1');

  assert.equal(st.midi.loaded, true);
  assert.equal(st.midi.enabled, true);
  assert.equal(captured.selected, 'diatonic-circle-1');
  assert.ok(captured.status.includes('loaded') || captured.status.includes('ready'));
  assert.ok(captured.syncCalls >= 1);

  if (originalDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
  if (originalFetch === undefined) {
    delete globalThis.fetch;
  } else {
    globalThis.fetch = originalFetch;
  }
});
