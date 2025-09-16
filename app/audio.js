// WebAudio primitives: initialize context and schedule click sounds

export function initAudio(st) {
  if (st.audioCtx) return;
  const C = window.AudioContext || window.webkitAudioContext;
  st.audioCtx = new C();
}

// mode: 'normal' | 'countin'
export function scheduleClick(ctx, t, accent, mode = 'normal') {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);

  if (mode === 'countin') {
    // Distinct count-in timbre (triangle), slightly lower pitch
    const a = accent ? 0.95 : 0.65;
    g.gain.linearRampToValueAtTime(a, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1000 : 700, t);
  } else {
    // Normal click (square)
    g.gain.linearRampToValueAtTime(accent ? 0.9 : 0.5, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.type = 'square';
    osc.frequency.setValueAtTime(accent ? 1800 : 1200, t);
  }

  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + (mode === 'countin' ? 0.09 : 0.07));
}

