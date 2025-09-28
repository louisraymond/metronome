export function considerStep(st, deps) {
  const { setTempo, stop, onDisarm } = deps || {};

  if (!st.armed || st.countInRemaining > 0) return { changed: false };
  const useTime = st.loopMode === 'time';
  const stepBars = Math.max(1, +st.stepN || 1);
  const stepDuration = Math.max(0, +st.stepDurationSec || 0);
  const metThreshold = useTime ? st.sinceSeconds >= stepDuration : st.sinceBars >= stepBars;

  if (!metThreshold) return { changed: false };

  st.sinceBars = 0;
  st.sinceSeconds = 0;
  const dir = st.dir === 'down' ? -1 : 1;
  const inc = +st.stepBpm || 2;
  const next = st.bpm + dir * inc;
  const tgt = +st.targetBpm || 160;
  const reached = dir > 0 ? next >= tgt : next <= tgt;

  if (setTempo) setTempo(reached ? tgt : next);

  if (reached && st.autoStop) {
    st.armed = false;
    if (typeof onDisarm === 'function') onDisarm();
    // Stop cleanly at a barline
    if (st.curBeatInBar === 0 && typeof stop === 'function') stop();
    return { changed: true, reached: true, disarmed: true };
  }

  return { changed: true, reached: false, disarmed: false };
}

export function estimateDrillDuration(st) {
  if (!st) return null;

  const autoStop = st.autoStop !== false;
  if (!autoStop) return { totalSeconds: Infinity, segments: Infinity };

  const beatsPerBar = Math.max(1, +st.beatsPerBar || 4);
  const beatUnit = Math.max(1, +st.beatUnit || 4);
  const startBpm = Math.max(1, +st.startBpm || 120);
  const targetBpm = Math.max(1, +st.targetBpm || startBpm);
  const stepSize = Math.max(1, +st.stepBpm || 1);
  const countInBars = Math.max(0, +st.countInBars || 0);
  const loopMode = st.loopMode === 'time' ? 'time' : 'bars';
  const stepBars = Math.max(1, +st.stepN || 1);
  const stepDuration = Math.max(0, +st.stepDurationSec || 0);
  const dir = st.dir === 'down' ? -1 : 1;

  const beatSeconds = (bpm) => (60 / bpm) * (4 / beatUnit);
  const barSeconds = (bpm) => beatSeconds(bpm) * beatsPerBar;
  const segmentSeconds = (bpm) =>
    loopMode === 'time' ? stepDuration : barSeconds(bpm) * stepBars;

  const delta = dir > 0 ? targetBpm - startBpm : startBpm - targetBpm;
  const stepsNeeded = delta > 0 ? Math.ceil(delta / stepSize) : 0;
  const segments = Math.max(1, stepsNeeded || 0);

  let totalSeconds = 0;
  for (let i = 0; i < segments; i++) {
    const rawTempo = startBpm + dir * stepSize * i;
    const tempo = dir > 0 ? Math.min(rawTempo, targetBpm) : Math.max(rawTempo, targetBpm);
    totalSeconds += segmentSeconds(Math.max(1, tempo));
  }

  if (countInBars > 0) {
    totalSeconds += barSeconds(startBpm) * countInBars;
  }

  return { totalSeconds, segments, stepsNeeded, loopMode };
}
