function shouldEnableSyncDebug() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('debugSync')) {
      const val = params.get('debugSync');
      if (val === '1') {
        window.localStorage?.setItem('mt_debug_sync', '1');
        return true;
      }
      if (val === '0') {
        window.localStorage?.removeItem('mt_debug_sync');
        return false;
      }
    }
    return window.localStorage?.getItem('mt_debug_sync') === '1';
  } catch (_) {
    return false;
  }
}

const BUILT_IN_MIDI = [
  {
    id: 'type-ab-voicings',
    label: 'Type AB 4-Note One-Hand Voicings',
    file: 'type-ab-4-note-one-hand-voicings.mid',
  },
  {
    id: 'diatonic-circle-1',
    label: 'Diatonic Circle of Fifths I',
    file: 'diatonic-circle-of-fifths-1.mid',
  },
  {
    id: 'diatonic-circle-voicings',
    label: 'Diatonic Circle 5ths · 2-Note Voicings (B→A)',
    file: 'diatonic-circle-5ths-2-note-voicings-b-a.mid',
  },
  {
    id: 'descending-cycle',
    label: 'Descending Dominants (Cycle of Fifths A-B-A)',
    file: 'descending-dominants-cycle-fifths-aba.mid',
  },
];

function createApp({
  stateMod,
  audioMod,
  speedMod,
  uiMod,
  routerMod,
  practicePlansMod,
  practicePlansViewMod,
}) {
  const { st, setTempo, resetCounters } = stateMod;
  const {
    initAudio,
    scheduleClick,
    setMidiTrack,
    clearMidi,
    setMidiEnabled,
    setMidiVolume,
    resetMidiPlayback,
    reanchorMidiPlayback,
    scheduleBeatMidi,
    stopMidi,
    teardownMidiNodes,
    preloadSoundfontInstrument,
  } = audioMod;
  const { considerStep } = speedMod;
  const { bindUI } = uiMod;
  const { createRouter } = routerMod || {};
  const { loadPlans, exportCurrentPlan } = practicePlansMod || {};
  const { createPracticePlansView } = practicePlansViewMod || {};

  const secPerBeat = () => (60.0 / st.bpm) * (4 / st.beatUnit);

  let hooks;
  const debugEnabled = shouldEnableSyncDebug();
  let debugCleanup = null;
  let debugBeatListener = null;
  const hasDOM = typeof document !== 'undefined' && typeof document.getElementById === 'function';
  const router = typeof createRouter === 'function'
    ? createRouter({ storage: typeof window !== 'undefined' ? window.localStorage : null })
    : null;

  const metronomeViewEl = hasDOM ? document.getElementById('metronomeView') : null;
  const practicePlansViewEl = hasDOM ? document.getElementById('practicePlansView') : null;
  const sideMenuEl = hasDOM ? document.getElementById('sideMenu') : null;
  const hamburgerEl = hasDOM ? document.getElementById('hamburgerBtn') : null;
  const closeMenuEl = hasDOM ? document.getElementById('closeMenuBtn') : null;
  const navLinks = hasDOM
    ? Array.from(document.querySelectorAll('.side-menu a[data-route]'))
    : [];

  let practicePlansView = null;
  let practicePlansLoadPromise = null;
  let cachedPracticePlans = [];

  const ensurePracticePlansLoaded = () => {
    if (!hasDOM || !practicePlansView || typeof loadPlans !== 'function') {
      return Promise.resolve(cachedPracticePlans);
    }
    if (practicePlansLoadPromise) return practicePlansLoadPromise;
    practicePlansLoadPromise = loadPlans()
      .then((plans) => {
        cachedPracticePlans = Array.isArray(plans) ? plans : [];
        practicePlansView.setPlans(cachedPracticePlans);
        st.practicePlansLibrary = cachedPracticePlans;
        return cachedPracticePlans;
      })
      .catch((err) => {
        console.warn('Practice plans manifest failed to load:', err);
        cachedPracticePlans = [];
        practicePlansView.setPlans([]);
        st.practicePlansLibrary = [];
        return [];
      });
    return practicePlansLoadPromise;
  };

  const queuePracticePlan = (plan) => {
    if (!plan) return;
    st.practicePlan = plan;
    st.practicePlanIndex = 0;
    st.practicePlanProgress = [];
    if (router?.navigate) router.navigate('metronome');
    router?.setMenuOpen?.(false);
    const label = plan.title || 'Untitled Plan';
    if (hooks?.renderMidiStatus) {
      hooks.renderMidiStatus(`Practice plan queued: ${label} (metronome integration coming soon)`);
    } else {
      console.info('Practice plan queued:', label);
    }
  };

  if (hasDOM && practicePlansViewEl && typeof createPracticePlansView === 'function') {
    practicePlansView = createPracticePlansView({
      root: practicePlansViewEl,
      midiLibrary: BUILT_IN_MIDI,
      onQueuePlan: queuePracticePlan,
      onExportPlan: (plan) => {
        if (typeof exportCurrentPlan === 'function') {
          exportCurrentPlan(plan);
        }
      },
    });

    if (typeof loadPlans === 'function' && typeof window !== 'undefined') {
      ensurePracticePlansLoaded();
    } else {
      practicePlansView.setPlans([]);
    }
  }

  const setActiveNav = (route) => {
    navLinks.forEach((link) => {
      link.classList.toggle('active', link.dataset.route === route);
    });
  };

  const showMetronomeView = () => {
    metronomeViewEl?.classList.remove('hidden');
    practicePlansViewEl?.classList.add('hidden');
    setActiveNav('metronome');
  };

  const hideMetronomeView = () => {
    metronomeViewEl?.classList.add('hidden');
  };

  const showPracticePlansView = () => {
    practicePlansViewEl?.classList.remove('hidden');
    metronomeViewEl?.classList.add('hidden');
    setActiveNav('practicePlans');
  };

  const hidePracticePlansView = () => {
    practicePlansViewEl?.classList.add('hidden');
  };

  const setDebugBeatListener = (fn) => {
    debugBeatListener = typeof fn === 'function' ? fn : null;
  };

  const resyncMidiTiming = () => {
    if (!st.midi?.loaded || !st.midi?.enabled) return;
    const beatDur = secPerBeat();
    if (st.isRunning && st.audioCtx) {
      reanchorMidiPlayback(st, beatDur);
    } else if (st.audioCtx) {
      stopMidi(st);
      resetMidiPlayback(st, beatDur);
    }
  };

  const mountDebugOverlay = () => {
    if (!debugEnabled || debugCleanup) return;
    if (typeof document === 'undefined') return;
    import('./debugSync.js')
      .then((mod) => {
        if (debugCleanup) return;
        debugCleanup = mod.mountSyncDebug(st, {
          secPerBeat,
          resync: resyncMidiTiming,
          registerBeatListener: setDebugBeatListener,
        });
      })
      .catch((err) => {
        console.warn('Failed to initialise sync debug overlay:', err);
      });
  };

  const loadBuiltInMidiSample = (id, opts = {}) => {
    const entry = BUILT_IN_MIDI.find((item) => item.id === id);
    if (!entry) {
      const err = new Error(`Unknown MIDI sample: ${id}`);
      if (!opts.quiet) hooks?.renderMidiStatus?.(err.message);
      return Promise.reject(err);
    }
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      const err = new Error('Built-in MIDI not available in this environment');
      if (!opts.quiet) hooks?.renderMidiStatus?.(err.message);
      return Promise.reject(err);
    }

    const url = `./assets/midi/${entry.file}`;
    if (!opts.quiet) hooks?.renderMidiStatus?.(`Loading ${entry.label}…`);

    return fetch(url)
      .then((resp) => {
        if (!resp.ok) throw new Error(`Failed to load MIDI (${resp.status})`);
        return resp.arrayBuffer();
      })
      .then(async (buffer) => {
        const midiMod = await import('./midi.js');
        const parsed = midiMod.parseMidiFile(buffer);
        setMidiTrack(st, { ...parsed, name: entry.label });
        st.midi.enabled = false;
        stopMidi(st);
        if (st.isRunning && st.audioCtx) {
          resetMidiPlayback(st, secPerBeat());
        }
        if (st.midi.instrument === 'rhodes') {
          preloadSoundfontInstrument(st, 'rhodes');
        }
        hooks?.syncMidiControls?.();
        hooks?.syncMidiLibrary?.(entry.id);
        if (!opts.quiet) hooks?.renderMidiStatus?.(`${entry.label} ready — toggle Enable to hear it.`);
      })
      .catch((err) => {
        console.warn('Built-in MIDI load failed:', err);
        if (!opts.quiet) hooks?.renderMidiStatus?.(`Failed to load MIDI: ${err.message}`);
        throw err;
      });
  };

  const preloadDefaultMidi = () => {
    if (st.midi?.loaded) return;
    const first = BUILT_IN_MIDI[0];
    if (!first) return;
    loadBuiltInMidiSample(first.id, { quiet: true }).catch(() => {});
  };

  const setMidiInstrument = (id) => {
    if (!st?.midi) return;
    const next = id === 'rhodes' ? 'rhodes' : 'synth';
    if (st.midi.instrument === next) return;
    st.midi.instrument = next;
    stopMidi(st, { preserveProgress: true });
    if (st.audioCtx && st.isRunning) {
      if (next === 'rhodes') preloadSoundfontInstrument(st, 'rhodes');
      reanchorMidiPlayback(st, secPerBeat());
    }
    hooks?.syncMidiControls?.();
    hooks?.syncMidiInstrument?.(next);
    hooks?.renderMidiStatus?.();
  };

  function nextNote() {
    st.nextNoteTime += secPerBeat();
    st.beats++;
    st.curBeatInBar = (st.curBeatInBar + 1) % st.beatsPerBar;

    if (st.curBeatInBar === 0) {
      st.bars++;
      const barDuration = secPerBeat() * st.beatsPerBar;
      const wasInCountIn = st.countInRemaining > 0;
      if (st.countInRemaining > 0) st.countInRemaining--;
      const stillInCountIn = st.countInRemaining > 0;

      if (wasInCountIn) {
        if (!stillInCountIn) {
          st.sinceBars = 0;
          st.sinceSeconds = 0;
        }
      } else {
        st.sinceBars++;
        st.sinceSeconds += barDuration;
      }
      considerStep(st, {
        setTempo: (bpm) => {
          setTempo(bpm);
          hooks?.syncTempoUI?.();
          if (st.isRunning) resyncMidiTiming();
        },
        stop,
        onDisarm: () => hooks?.renderArmState?.(),
      });
    }
    hooks?.onKPIs?.(st);
  }

  function scheduler() {
    if (!st.audioCtx) return;
    while (st.nextNoteTime < st.audioCtx.currentTime + st.scheduleAhead) {
      const beatStartTime = st.nextNoteTime;
      const beatDuration = secPerBeat();
      const nextBeat = (st.curBeatInBar + 1) % st.beatsPerBar;
      const accent = st.accentFirst && nextBeat === 0;
      const inCountIn = st.countInRemaining > 0;

      if (inCountIn) {
        scheduleClick(st.audioCtx, st.nextNoteTime, accent, 'countin');
      } else {
        let shouldClick = true;
        if (st.clickPattern === '24') shouldClick = nextBeat === 1 || nextBeat === 3;
        else if (st.clickPattern === '1') shouldClick = nextBeat === 0;
        else if (st.clickPattern === 'off') shouldClick = false;

        if (st.clickPattern === 'off') {
          const halfBeat = beatDuration / 2;
          scheduleClick(st.audioCtx, st.nextNoteTime + halfBeat, accent, 'normal');
        } else if (shouldClick) {
          scheduleClick(st.audioCtx, st.nextNoteTime, accent, 'normal');
        }
      }

      const beatIndexForMidi = st.midi?.scheduledBeats ?? 0;
      const scheduledMidi = scheduleBeatMidi(st, beatStartTime, beatDuration);

      hooks?.onBeat?.(nextBeat, accent);

      if (debugBeatListener) {
        const countInBeats = st.midi?.countInBeats ?? 0;
        debugBeatListener({
          beatIndex: beatIndexForMidi,
          beatStartTime,
          beatDuration,
          events: scheduledMidi,
          isCountInBeat: beatIndexForMidi < countInBeats,
          bpm: st.bpm,
          beatsPerBar: st.beatsPerBar,
        });
      }

      nextNote();
    }
    st.schedulerTimer = setTimeout(scheduler, st.lookahead * 1000);
  }

  function start() {
    initAudio(st);
    if (st.isRunning) return;
    st.isRunning = true;

    if (st.armed) {
      setTempo(st.startBpm || 120);
      hooks?.syncTempoUI?.();
    }

    const beatDur = secPerBeat();
    resetCounters(st.audioCtx.currentTime, beatDur);
    resetMidiPlayback(st, beatDur);

    hooks?.onBeat?.(0, true);
    scheduler();
    hooks?.onKPIs?.(st);
  }

  function stop() {
    if (!st.isRunning) return;
    st.isRunning = false;
    clearTimeout(st.schedulerTimer);
    stopMidi(st);
  }

  function panic() {
    stop();
    if (st.audioCtx) {
      try {
        st.audioCtx.close();
      } catch (_) {}
      st.audioCtx = null;
    }
    teardownMidiNodes();
    if (debugCleanup) {
      debugCleanup();
      debugCleanup = null;
    }
    if (debugBeatListener) debugBeatListener = null;
  }

  hooks = bindUI(st, {
    start,
    stop,
    panic,
    setTempo: (bpm) => {
      setTempo(bpm);
      hooks?.syncTempoUI?.();
      if (st.isRunning) resyncMidiTiming();
    },
    setMidiTrack: (data) => setMidiTrack(st, data),
    clearMidi: () => clearMidi(st),
    setMidiEnabled: (value) => setMidiEnabled(st, value),
    setMidiVolume: (value) => setMidiVolume(st, value),
    refreshMidiTiming: resyncMidiTiming,
    loadBuiltInMidi: (id) => loadBuiltInMidiSample(id),
    midiLibrary: BUILT_IN_MIDI,
    setMidiInstrument,
  });

  if (router) {
    router.registerView('metronome', {
      show: showMetronomeView,
      hide: hideMetronomeView,
    });
    router.registerView('practicePlans', {
      show: showPracticePlansView,
      hide: hidePracticePlansView,
    });

    router.onMenuToggle((open) => {
      sideMenuEl?.classList.toggle('open', open);
    });

    hamburgerEl?.addEventListener('click', () => router.toggleMenu());
    closeMenuEl?.addEventListener('click', () => router.setMenuOpen(false));
    navLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const route = link.dataset.route;
        if (route) {
          router.navigate(route);
          router.setMenuOpen(false);
        }
      });
    });

    router.init();
    router.setMenuOpen(false);
  } else {
    showMetronomeView();
  }

  mountDebugOverlay();
  preloadDefaultMidi();

  setTempo(120);
  hooks?.syncTempoUI?.();
  hooks?.renderMeter?.();
  hooks?.syncStepUI?.();
  hooks?.syncMidiInstrument?.(st.midi?.instrument ?? 'synth');

  return { start, stop, panic, st, hooks };
}

if (typeof globalThis !== 'undefined' && !globalThis.__createAppForTest) {
  Object.defineProperty(globalThis, '__createAppForTest', {
    value: createApp,
    configurable: true,
    writable: false,
  });
}

function bootstrap() {
  const load = Promise.all([
    import('./state.js'),
    import('./audio.js'),
    import('./speedTrainer.js'),
    import('./ui.js'),
    import('./router.js'),
    import('./practicePlans.js'),
    import('./practicePlansView.js'),
  ]);

  load
    .then(([
      stateMod,
      audioMod,
      speedMod,
      uiMod,
      routerMod,
      practicePlansMod,
      practicePlansViewMod,
    ]) => {
      const app = createApp({
        stateMod,
        audioMod,
        speedMod,
        uiMod,
        routerMod,
        practicePlansMod,
        practicePlansViewMod,
      });
      if (typeof window !== 'undefined') {
        window.app = { start: app.start, stop: app.stop, panic: app.panic, st: app.st };
      }
    })
    .catch((err) => {
      console.error('Metronome bootstrap failed:', err);
    });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
} else {
  bootstrap();
}
