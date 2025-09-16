/*
  Bootstrap the modular metronome with dynamic imports so this file works
  whether loaded as a classic script or as a module. No top-level import/export.
*/

function bootstrap() {
  const load = Promise.all([
    import('./state.js'),
    import('./audio.js'),
    import('./speedTrainer.js'),
    import('./ui.js'),
  ]);

  load.then(([stateMod, audioMod, speedMod, uiMod]) => {
    const { st, setTempo, resetCounters } = stateMod;
    const { initAudio, scheduleClick } = audioMod;
    const { considerStep } = speedMod;
    const { bindUI } = uiMod;

    const secPerBeat = () => (60.0 / st.bpm) * (4 / st.beatUnit);

    let hooks; // assigned after function declarations

    function nextNote() {
      st.nextNoteTime += secPerBeat();
      st.beats++;
      st.curBeatInBar = (st.curBeatInBar + 1) % st.beatsPerBar;

      if (st.curBeatInBar === 0) {
        st.bars++;
        st.sinceBars++;
        if (st.countInRemaining > 0) st.countInRemaining--;
        considerStep(st, {
          setTempo: (bpm) => {
            setTempo(bpm);
            hooks?.syncTempoUI?.();
          },
          stop,
          onDisarm: () => hooks?.renderArmState?.(),
        });
      }
      hooks?.onKPIs?.(st);
    }

    function scheduler() {
      while (st.nextNoteTime < st.audioCtx.currentTime + st.scheduleAhead) {
        const nextBeat = (st.curBeatInBar + 1) % st.beatsPerBar;
        const accent = st.accentFirst && nextBeat === 0;
        const inCountIn = st.countInRemaining > 0;

        if (inCountIn) {
          // Count-in: always click every beat, different sound
          scheduleClick(st.audioCtx, st.nextNoteTime, accent, 'countin');
        } else {
          // Normal playback with click pattern
          let shouldClick = true;
          if (st.clickPattern === '24') shouldClick = nextBeat === 1 || nextBeat === 3;
          else if (st.clickPattern === '1') shouldClick = nextBeat === 0;
          else if (st.clickPattern === 'off') shouldClick = false;

          if (st.clickPattern === 'off') {
            const halfBeat = secPerBeat() / 2;
            scheduleClick(st.audioCtx, st.nextNoteTime + halfBeat, accent, 'normal');
          } else if (shouldClick) {
            scheduleClick(st.audioCtx, st.nextNoteTime, accent, 'normal');
          }
        }

        hooks?.onBeat?.(nextBeat, accent);
        nextNote();
      }
      st.schedulerTimer = setTimeout(scheduler, st.lookahead * 1000);
    }

    function start() {
      initAudio(st);
      if (st.isRunning) return;
      st.isRunning = true;

      if (st.armed) setTempo(st.startBpm || 120);

      const beatDur = secPerBeat();
      resetCounters(st.audioCtx.currentTime, beatDur);

      hooks?.onBeat?.(0, true); // show downbeat LED immediately
      scheduler();
      hooks?.onKPIs?.(st);
    }

    function stop() {
      if (!st.isRunning) return;
      st.isRunning = false;
      clearTimeout(st.schedulerTimer);
    }

    function panic() {
      stop();
      if (st.audioCtx) {
        try {
          st.audioCtx.close();
        } catch (_) {}
        st.audioCtx = null;
      }
    }

    // Bind UI now that we have functions available
    hooks = bindUI(st, {
      start,
      stop,
      panic,
      setTempo: (bpm) => {
        setTempo(bpm);
        hooks?.syncTempoUI?.();
      },
    });

    // Boot defaults
    setTempo(120);
    hooks?.syncTempoUI?.();
    hooks?.renderMeter?.();
    hooks?.syncStepUI?.();

    // Optional: expose controls for inline handlers or quick debugging
    if (typeof window !== 'undefined') {
      window.app = { start, stop, panic, st };
    }
  })
  .catch((err) => {
    console.error('Metronome bootstrap failed:', err);
  });
}

// Ensure DOM is ready before binding UI
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
} else {
  // Non-DOM environment (unlikely in browser), just run
  bootstrap();
}
