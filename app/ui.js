import { clamp, median } from './utils.js';
import { estimateDrillDuration } from './speedTrainer.js';
import { parseMidiFile } from './midi.js';

const $ = (id) => document.getElementById(id);

export function bindUI(st, api) {
  const { start, stop, panic, setTempo } = api;

  // Elements
  const elBpmReadout = $('bpmReadout');
  const elTargetReadout = $('targetReadout');
  const elStepRule = $('stepRuleReadout');
  const elTempoSlider = $('tempoSlider');
  const elBeatsPerBar = $('beatsPerBar');
  const elBeatUnit = $('beatUnit');
  const elAccentFirst = $('accentFirst');
  const elMeter = $('meterLeds');
  const elBars = $('barsKpi');
  const elBeats = $('beatsKpi');
  const elCircle = $('tempoCircle');
  const elTap = $('tapBtn');
  const elStart = $('startBtn');
  const elStop = $('stopBtn');
  const elPanic = $('panicBtn');
  const elStartBpm = $('startBpm');
  const elTargetBpm = $('targetBpm');
  const elStepBpm = $('stepBpm');
  const elStepN = $('stepN');
  const elLoopMode = $('loopMode');
  const elLoopBarsGroup = $('loopBarsGroup');
  const elLoopTimeGroup = $('loopTimeGroup');
  const elStepMinutes = $('stepMinutes');
  const elStepSeconds = $('stepSeconds');
  const elArm = $('armSpeedBtn');
  const elCountIn = $('countInBars');
  const elAutoStop = $('autoStop');
  const elClickPattern = $('clickPattern');
  const elDrillEstimate = $('drillEstimate');
  const elMidiFile = $('midiFile');
  const elMidiLibrary = $('midiLibrary');
  const elMidiInstrument = $('midiInstrument');
  const elMidiEnable = $('midiEnable');
  const elMidiVolume = $('midiVolume');
  const elMidiStatus = $('midiStatus');
  const elMidiClear = $('clearMidiBtn');
  const midiLibrary = Array.isArray(api?.midiLibrary) ? api.midiLibrary : [];

  const parseNumericInput = (value, fallback, min, max = Number.POSITIVE_INFINITY) => {
    const raw = typeof value === 'string' ? value.trim() : value;
    if (raw === '') return clamp(fallback, min, max);
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return clamp(fallback, min, max);
    return clamp(numeric, min, max);
  };

  const formatMidiDuration = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins > 0) return `${mins}m ${secs.toString().padStart(2, '0')}s`;
    return `${secs}s`;
  };

  const populateMidiLibrary = () => {
    if (!elMidiLibrary) return;
    elMidiLibrary.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = midiLibrary.length ? 'Select built-in MIDI…' : 'No built-in MIDI available';
    elMidiLibrary.appendChild(placeholder);
    midiLibrary.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label;
      elMidiLibrary.appendChild(option);
    });
  };

  const formatBarEstimate = (bars) => {
    if (!Number.isFinite(bars) || bars <= 0) return null;
    if (bars < 1) return bars.toFixed(2);
    if (bars < 10) return bars.toFixed(1);
    return Math.round(bars).toString();
  };

  const formatLoopDuration = (seconds) => {
    const total = Math.max(0, Math.round(+seconds || 0));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    if (mins > 0) return `${mins}m ${secs.toString().padStart(2, '0')}s`;
    return `${secs}s`;
  };

  const formatEstimateDuration = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    const rounded = Math.round(seconds);
    const hrs = Math.floor(rounded / 3600);
    const mins = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs.toString().padStart(2, '0')}s`;
    return `${secs}s`;
  };

  const syncDurationInputs = () => {
    if (!elStepMinutes || !elStepSeconds) return;
    const minutes = Math.max(0, Math.floor(+elStepMinutes.value || 0));
    let seconds = Math.max(0, Math.floor(+elStepSeconds.value || 0));
    if (seconds > 59) seconds = 59;
    st.stepDurationSec = minutes * 60 + seconds;
    elStepMinutes.value = minutes;
    elStepSeconds.value = seconds;
  };

  const updateDrillEstimate = () => {
    if (!elDrillEstimate) return;
    if (st.autoStop === false) {
      elDrillEstimate.textContent = 'Estimated time: Runs until stopped';
      return;
    }
    const est = estimateDrillDuration(st);
    if (!est || !Number.isFinite(est.totalSeconds) || est.totalSeconds <= 0) {
      elDrillEstimate.textContent = 'Estimated time: —';
      return;
    }
    const countIn = Math.max(0, +st.countInBars || 0);
    const parts = [];
    if (Number.isFinite(est.segments)) {
      const noun = st.loopMode === 'time' ? 'loop' : 'segment';
      const label = est.segments === 1 ? noun : `${noun}s`;
      parts.push(`${est.segments} ${label}`);
    }
    if (countIn > 0) parts.push(`${countIn} count-in ${countIn === 1 ? 'bar' : 'bars'}`);
    const suffix = parts.length ? ` (${parts.join(' + ')})` : '';
    elDrillEstimate.textContent = `Estimated time: ${formatEstimateDuration(est.totalSeconds)}${suffix}`;
  };

  function syncTempoUI() {
    if (elBpmReadout) elBpmReadout.textContent = st.bpm;
    if (elTempoSlider) elTempoSlider.value = st.bpm;
    elCircle?.style?.setProperty('--angle', `${Math.min(300, st.bpm) * 1.2}deg`);
  }

  function syncStepUI() {
    if (elStepRule) {
      if (st.loopMode === 'time') {
        elStepRule.textContent = formatLoopDuration(st.stepDurationSec);
      } else {
        const label = st.stepN === 1 ? 'bar' : 'bars';
        elStepRule.textContent = `${st.stepN} ${label}`;
      }
    }
    if (elLoopMode) elLoopMode.value = st.loopMode;
    elLoopBarsGroup?.classList.toggle('hidden', st.loopMode !== 'bars');
    elLoopTimeGroup?.classList.toggle('hidden', st.loopMode !== 'time');
    if (elStepMinutes && elStepSeconds) {
      const mins = Math.floor((st.stepDurationSec || 0) / 60);
      const secs = Math.max(0, Math.round(st.stepDurationSec || 0) % 60);
      elStepMinutes.value = mins;
      elStepSeconds.value = secs;
    }
  }

  function renderMeter() {
    if (!elMeter) return;
    elMeter.innerHTML = '';
    st.leds = [];
    for (let i = 0; i < st.beatsPerBar; i++) {
      const d = document.createElement('div');
      d.className = 'led';
      elMeter.appendChild(d);
      st.leds.push(d);
    }
  }

  function visualBeat(beatIndex /*, accent */) {
    if (!st.leds?.length) return;
    st.leds.forEach((d, i) => d.classList.toggle('on', i === beatIndex));
  }

  function updateKPIs() {
    if (elBars) elBars.textContent = st.bars;
    if (elBeats) elBeats.textContent = st.beats;
  }

  function renderArmState() {
    if (!elArm) return;
    elArm.textContent = st.armed ? 'Armed ✓' : 'Arm Speed Trainer';
    elArm.classList.toggle('ghost', !!st.armed);
  }

  const renderMidiStatus = (message) => {
    if (!elMidiStatus) return;
    if (message) {
      elMidiStatus.textContent = message;
      return;
    }
    if (!st.midi?.loaded) {
      elMidiStatus.textContent = 'No MIDI loaded.';
      return;
    }
    const parts = [];
    if (st.midi.name) parts.push(st.midi.name);
    if (Number.isFinite(st.midi.duration)) parts.push(`≈ ${formatMidiDuration(st.midi.duration)}`);
    if (st.midi.timeSignature?.numerator && st.midi.timeSignature?.denominator) {
      parts.push(`${st.midi.timeSignature.numerator}/${st.midi.timeSignature.denominator}`);
    }
    const bars = formatBarEstimate(st.midi.barEstimate);
    if (bars) parts.push(`~${bars} bars`);
    const instrumentLabel = st.midi.instrument === 'rhodes' ? 'Sound: Rhodes (SoundFont)' : 'Sound: Internal Synth';
    parts.push(instrumentLabel);
    parts.push(`${st.midi.notes?.length ?? 0} notes`);
    elMidiStatus.textContent = parts.join(' · ');
  };

  const syncMidiControls = () => {
    if (!st.midi) return;
    if (elMidiEnable) {
      elMidiEnable.checked = !!st.midi.enabled && !!st.midi.loaded;
      elMidiEnable.disabled = !st.midi.loaded;
    }
    if (elMidiVolume) {
      const volPercent = Math.round((st.midi.volume ?? 0.6) * 100);
      elMidiVolume.value = clamp(volPercent, 0, 100);
      elMidiVolume.disabled = !st.midi.loaded || !st.midi.enabled;
    }
    if (elMidiClear) elMidiClear.disabled = !st.midi.loaded;
    if (elMidiInstrument) {
      elMidiInstrument.value = st.midi.instrument ?? 'synth';
    }
  };

  const syncMidiLibrarySelection = (id) => {
    if (!elMidiLibrary) return;
    elMidiLibrary.value = id ?? '';
  };

  const syncMidiInstrument = (id) => {
    if (!elMidiInstrument) return;
    elMidiInstrument.value = id ?? 'synth';
  };

  populateMidiLibrary();

  // Event wiring
  elTempoSlider?.addEventListener('input', (e) => {
    setTempo?.(e.target.value);
    syncTempoUI();
  });

  document
    .querySelectorAll('[data-tempo]')
    .forEach((b) => b.addEventListener('click', () => {
      setTempo?.(+b.dataset.tempo);
      syncTempoUI();
    }));

  elBeatsPerBar?.addEventListener('change', (e) => {
    st.beatsPerBar = +e.target.value;
    renderMeter();
    updateDrillEstimate();
  });

  elBeatUnit?.addEventListener('change', (e) => {
    st.beatUnit = +e.target.value;
    updateDrillEstimate();
  });
  elAccentFirst?.addEventListener('change', (e) => (st.accentFirst = e.target.checked));
  elClickPattern?.addEventListener('change', (e) => (st.clickPattern = e.target.value));

  elStart?.addEventListener('click', async () => {
    // Ensure user-gesture resumption if needed
    await st.audioCtx?.resume?.();
    start?.();
  });
  elStop?.addEventListener('click', () => stop?.());
  elPanic?.addEventListener('click', () => panic?.());

  // Tap tempo
  let tapTimes = [];
  elTap?.addEventListener('click', () => {
    const now = performance.now();
    tapTimes.push(now);
    tapTimes = tapTimes.filter((t) => now - t < 3000);
    if (tapTimes.length >= 3) {
      const ivals = [];
      for (let i = 1; i < tapTimes.length; i++) ivals.push(tapTimes[i] - tapTimes[i - 1]);
      const recent = ivals.slice(-5);
      const m = median(recent);
      const bpm = clamp(Math.round(60000 / m), 20, 300);
      setTempo?.(bpm);
      syncTempoUI();
    }
  });

  // Inputs -> state
  const commitStartBpm = () => {
    if (!elStartBpm) return;
    const next = parseNumericInput(elStartBpm.value, 120, 20, 300);
    st.startBpm = next;
    elStartBpm.value = next;
  };
  elStartBpm?.addEventListener('input', (e) => {
    st.startBpm = parseNumericInput(e.target.value, 120, 20, 300);
    updateDrillEstimate();
  });
  elStartBpm?.addEventListener('blur', () => {
    commitStartBpm();
    updateDrillEstimate();
  });
  elStartBpm?.addEventListener('change', () => {
    commitStartBpm();
    updateDrillEstimate();
  });

  const commitTargetBpm = () => {
    if (!elTargetBpm) return;
    const next = parseNumericInput(elTargetBpm.value, 160, 20, 300);
    st.targetBpm = next;
    elTargetBpm.value = next;
    if (elTargetReadout) elTargetReadout.textContent = st.targetBpm;
  };
  elTargetBpm?.addEventListener('input', (e) => {
    st.targetBpm = parseNumericInput(e.target.value, 160, 20, 300);
    if (elTargetReadout) elTargetReadout.textContent = st.targetBpm;
    updateDrillEstimate();
  });
  elTargetBpm?.addEventListener('blur', () => {
    commitTargetBpm();
    updateDrillEstimate();
  });
  elTargetBpm?.addEventListener('change', () => {
    commitTargetBpm();
    updateDrillEstimate();
  });

  const commitStepBpm = () => {
    if (!elStepBpm) return;
    const next = parseNumericInput(elStepBpm.value, 4, 1, 40);
    st.stepBpm = next;
    elStepBpm.value = next;
  };
  elStepBpm?.addEventListener('input', (e) => {
    st.stepBpm = parseNumericInput(e.target.value, 4, 1, 40);
    updateDrillEstimate();
  });
  elStepBpm?.addEventListener('blur', () => {
    commitStepBpm();
    updateDrillEstimate();
  });
  elStepBpm?.addEventListener('change', () => {
    commitStepBpm();
    updateDrillEstimate();
  });

  const commitStepN = () => {
    if (!elStepN) return;
    const next = parseNumericInput(elStepN.value, 1, 1);
    st.stepN = next;
    elStepN.value = next;
    syncStepUI();
  };
  elStepN?.addEventListener('input', (e) => {
    st.stepN = parseNumericInput(e.target.value, 1, 1);
    syncStepUI();
    updateDrillEstimate();
  });
  elStepN?.addEventListener('blur', () => {
    commitStepN();
    updateDrillEstimate();
  });
  elStepN?.addEventListener('change', () => {
    commitStepN();
    updateDrillEstimate();
  });
  elLoopMode?.addEventListener('change', (e) => {
    st.loopMode = e.target.value === 'time' ? 'time' : 'bars';
    syncStepUI();
    updateDrillEstimate();
  });
  elStepMinutes?.addEventListener('input', () => {
    syncDurationInputs();
    syncStepUI();
    updateDrillEstimate();
  });
  elStepSeconds?.addEventListener('input', () => {
    syncDurationInputs();
    syncStepUI();
    updateDrillEstimate();
  });

  document
    .querySelectorAll('#dirSwitch button')
    .forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#dirSwitch button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        st.dir = b.dataset.dir;
        updateDrillEstimate();
      }),
    );

  const commitCountIn = () => {
    if (!elCountIn) return;
    const next = parseNumericInput(elCountIn.value, 0, 0);
    st.countInBars = next;
    elCountIn.value = next;
  };
  elCountIn?.addEventListener('input', (e) => {
    st.countInBars = parseNumericInput(e.target.value, 0, 0);
    updateDrillEstimate();
  });
  elCountIn?.addEventListener('blur', () => {
    commitCountIn();
    updateDrillEstimate();
  });
  elCountIn?.addEventListener('change', () => {
    commitCountIn();
    updateDrillEstimate();
  });
  elAutoStop?.addEventListener('change', (e) => {
    st.autoStop = e.target.checked;
    updateDrillEstimate();
  });
  elArm?.addEventListener('click', () => {
    st.armed = !st.armed;
    renderArmState();
  });

  elMidiLibrary?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    api?.loadBuiltInMidi?.(id);
  });

  elMidiInstrument?.addEventListener('change', (e) => {
    api?.setMidiInstrument?.(e.target.value || 'synth');
  });

  elMidiFile?.addEventListener('change', async (e) => {
    const [file] = e.target.files || [];
    if (!file) return;
    syncMidiLibrarySelection('');
    try {
      renderMidiStatus('Loading MIDI…');
      const buffer = await file.arrayBuffer();
      const parsed = parseMidiFile(buffer);
      const hasNotes = parsed.notes?.length > 0;
      api?.setMidiTrack?.({ ...parsed, name: file.name });
      st.midi.notes = parsed.notes;
      st.midi.duration = parsed.duration;
      st.midi.name = file.name;
      st.midi.loaded = hasNotes;
      st.midi.enabled = hasNotes;
      st.midi.totalBeats = parsed.totalBeats ?? 0;
      st.midi.barEstimate = parsed.barEstimate ?? 0;
      st.midi.timeSignature = parsed.timeSignature ?? { numerator: 4, denominator: 4 };
      if (hasNotes) {
        api?.setMidiEnabled?.(true);
        if (st.isRunning) api?.refreshMidiTiming?.();
      }
      syncMidiControls();
      renderMidiStatus(hasNotes ? null : 'File parsed but no playable notes found.');
    } catch (err) {
      api?.clearMidi?.();
      st.midi.loaded = false;
      st.midi.enabled = false;
      st.midi.totalBeats = 0;
      st.midi.barEstimate = 0;
      st.midi.timeSignature = { numerator: 4, denominator: 4 };
      api?.setMidiEnabled?.(false);
      syncMidiControls();
      renderMidiStatus(err?.message ? `Failed to load MIDI: ${err.message}` : 'Failed to load MIDI file.');
    }
    if (elMidiFile) elMidiFile.value = '';
  });

  elMidiEnable?.addEventListener('change', (e) => {
    const enabled = !!e.target.checked && !!st.midi.loaded;
    st.midi.enabled = enabled;
    api?.setMidiEnabled?.(enabled);
    if (enabled && st.isRunning) api?.refreshMidiTiming?.();
    syncMidiControls();
  });

  elMidiVolume?.addEventListener('input', (e) => {
    const percent = clamp(Number(e.target.value) || 0, 0, 100);
    const value = percent / 100;
    st.midi.volume = value;
    api?.setMidiVolume?.(value);
  });

  elMidiClear?.addEventListener('click', () => {
    api?.clearMidi?.();
    st.midi.loaded = false;
    st.midi.enabled = false;
    st.midi.notes = [];
    st.midi.duration = 0;
    st.midi.name = '';
    st.midi.totalBeats = 0;
    st.midi.barEstimate = 0;
    st.midi.timeSignature = { numerator: 4, denominator: 4 };
    api?.setMidiEnabled?.(false);
    syncMidiControls();
    renderMidiStatus();
    syncMidiLibrarySelection('');
  });

  // Presets
  $('savePresetBtn')?.addEventListener('click', () => {
    const p = {
      bpm: st.bpm,
      startBpm: st.startBpm,
      targetBpm: st.targetBpm,
      stepBpm: st.stepBpm,
      stepN: st.stepN,
      loopMode: st.loopMode,
      stepDurationSec: st.stepDurationSec,
      dir: st.dir,
      autoStop: st.autoStop,
      countInBars: st.countInBars,
      beatsPerBar: st.beatsPerBar,
      beatUnit: st.beatUnit,
      accentFirst: st.accentFirst,
      clickPattern: st.clickPattern,
    };
    localStorage.setItem('mt_preset_simple_v2', JSON.stringify(p));
  });

  $('loadPresetBtn')?.addEventListener('click', () => {
    const raw = localStorage.getItem('mt_preset_simple_v2');
    if (!raw) return;
    const p = JSON.parse(raw);
    setTempo?.(p.bpm ?? 120);
    st.startBpm = p.startBpm ?? 120;
    if (elStartBpm) elStartBpm.value = st.startBpm;
    st.targetBpm = p.targetBpm ?? 160;
    if (elTargetBpm) elTargetBpm.value = st.targetBpm;
    if (elTargetReadout) elTargetReadout.textContent = st.targetBpm;
    st.stepBpm = p.stepBpm ?? 4;
    if (elStepBpm) elStepBpm.value = st.stepBpm;
    st.stepN = p.stepN ?? 4;
    if (elStepN) elStepN.value = st.stepN;
    st.loopMode = p.loopMode === 'time' ? 'time' : 'bars';
    st.stepDurationSec = Math.max(0, p.stepDurationSec ?? 60);
    syncStepUI();
    st.dir = p.dir ?? 'up';
    document
      .querySelectorAll('#dirSwitch button')
      .forEach((x) => x.classList.toggle('active', x.dataset.dir === st.dir));
    st.autoStop = !!p.autoStop;
    if (elAutoStop) elAutoStop.checked = st.autoStop;
    st.countInBars = p.countInBars ?? 2;
    if (elCountIn) elCountIn.value = st.countInBars;
    st.beatsPerBar = p.beatsPerBar ?? 4;
    if (elBeatsPerBar) elBeatsPerBar.value = st.beatsPerBar;
    renderMeter();
    st.beatUnit = p.beatUnit ?? 4;
    if (elBeatUnit) elBeatUnit.value = st.beatUnit;
    st.accentFirst = !!p.accentFirst;
    if (elAccentFirst) elAccentFirst.checked = st.accentFirst;
    st.clickPattern = p.clickPattern ?? 'all';
    if (elClickPattern) elClickPattern.value = st.clickPattern;
    syncTempoUI();
    updateDrillEstimate();
  });

  // Initial UI state
  if (elTargetReadout) elTargetReadout.textContent = st.targetBpm;
  syncTempoUI();
  syncStepUI();
  renderMeter();
  renderArmState();
  updateDrillEstimate();
  syncMidiControls();
  renderMidiStatus();

  // Hooks consumed by the scheduler
  return {
    onBeat: (nextBeat, accent) => visualBeat(nextBeat, accent),
    onKPIs: () => updateKPIs(),
    syncTempoUI,
    syncStepUI,
    renderMeter,
    renderArmState,
    updateDrillEstimate,
    renderMidiStatus,
    syncMidiControls,
    syncMidiLibrary: syncMidiLibrarySelection,
    syncMidiInstrument,
  };
}
