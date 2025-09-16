// Speed trainer logic: stepping tempo after N bars toward a target

export function considerStep(st, deps) {
  const { setTempo, stop, onDisarm } = deps || {};

  if (!st.armed || st.countInRemaining > 0) return { changed: false };
  if (st.sinceBars < st.stepN) return { changed: false };

  st.sinceBars = 0;
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

