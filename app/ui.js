import { clamp, median } from './utils.js';

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
  const elArm = $('armSpeedBtn');
  const elCountIn = $('countInBars');
  const elAutoStop = $('autoStop');
  const elClickPattern = $('clickPattern');

  function syncTempoUI() {
    if (elBpmReadout) elBpmReadout.textContent = st.bpm;
    if (elTempoSlider) elTempoSlider.value = st.bpm;
    elCircle?.style?.setProperty('--angle', `${Math.min(300, st.bpm) * 1.2}deg`);
  }

  function syncStepUI() {
    if (elStepRule) elStepRule.textContent = `${st.stepN} bars`;
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
  });

  elBeatUnit?.addEventListener('change', (e) => (st.beatUnit = +e.target.value));
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
  elStartBpm?.addEventListener('input', (e) => (st.startBpm = +e.target.value || 120));
  elTargetBpm?.addEventListener('input', (e) => {
    st.targetBpm = +e.target.value || 160;
    if (elTargetReadout) elTargetReadout.textContent = st.targetBpm;
  });
  elStepBpm?.addEventListener('input', (e) => (st.stepBpm = +e.target.value || 4));
  elStepN?.addEventListener('input', (e) => {
    st.stepN = Math.max(1, +e.target.value || 1);
    syncStepUI();
  });

  document
    .querySelectorAll('#dirSwitch button')
    .forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#dirSwitch button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        st.dir = b.dataset.dir;
      }),
    );

  elCountIn?.addEventListener('input', (e) => (st.countInBars = Math.max(0, +e.target.value || 0)));
  elAutoStop?.addEventListener('change', (e) => (st.autoStop = e.target.checked));
  elArm?.addEventListener('click', () => {
    st.armed = !st.armed;
    renderArmState();
  });

  // Presets
  $('savePresetBtn')?.addEventListener('click', () => {
    const p = {
      bpm: st.bpm,
      startBpm: st.startBpm,
      targetBpm: st.targetBpm,
      stepBpm: st.stepBpm,
      stepN: st.stepN,
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
  });

  // Initial UI state
  if (elTargetReadout) elTargetReadout.textContent = st.targetBpm;
  syncTempoUI();
  syncStepUI();
  renderMeter();
  renderArmState();

  // Hooks consumed by the scheduler
  return {
    onBeat: (nextBeat, accent) => visualBeat(nextBeat, accent),
    onKPIs: () => updateKPIs(),
    syncTempoUI,
    syncStepUI,
    renderMeter,
    renderArmState,
  };
}

