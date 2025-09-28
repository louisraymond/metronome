const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const formatTime = (value) => {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(3);
};

const formatDelta = (value) => {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(3)}s`;
};

const midiNoteName = (note) => {
  if (!Number.isFinite(note)) return 'N/A';
  const pitch = Math.round(note);
  const octave = Math.floor(pitch / 12) - 1;
  const name = NOTE_NAMES[(pitch % 12 + 12) % 12];
  return `${name}${octave}`;
};

const ensureStyle = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('sync-debug-style')) return;
  const style = document.createElement('style');
  style.id = 'sync-debug-style';
  style.textContent = `
    #sync-debug-overlay {
      position: fixed;
      inset: 12px 12px auto auto;
      width: 340px;
      max-height: calc(100vh - 24px);
      overflow: auto;
      background: rgba(12, 18, 32, 0.94);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 12px;
      font: 12px/1.4 "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace;
      color: #dce8ff;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
      z-index: 9999;
    }
    #sync-debug-overlay h5 {
      margin: 0 0 8px;
      font-size: 13px;
      color: #8ec5ff;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    #sync-debug-overlay .section {
      margin-bottom: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      padding-top: 8px;
    }
    #sync-debug-overlay .section:first-of-type {
      border-top: none;
      padding-top: 0;
    }
    #sync-debug-overlay .kv {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    #sync-debug-overlay strong {
      display: block;
      margin-bottom: 4px;
      font-size: 12px;
      color: #a7d6ff;
      letter-spacing: 0.05em;
    }
    #sync-debug-overlay ul.timeline-list {
      margin: 6px 0 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    #sync-debug-overlay ul.timeline-list li {
      border: 1px solid rgba(142, 197, 255, 0.18);
      border-radius: 6px;
      padding: 4px 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    #sync-debug-overlay ul.timeline-list li.countin {
      border-color: rgba(255, 255, 255, 0.15);
      color: #8da3c4;
    }
    #sync-debug-overlay ul.timeline-list li.lag {
      border-color: rgba(255, 137, 137, 0.4);
      color: #ffbbbb;
    }
    #sync-debug-overlay ul.timeline-list li.lead {
      border-color: rgba(255, 209, 103, 0.4);
      color: #ffe8b0;
    }
    #sync-debug-overlay .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    #sync-debug-overlay .notes {
      font-size: 11px;
      color: #92e0ff;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    #sync-debug-overlay .notes span dim {
      color: #7aa6c4;
    }
    #sync-debug-overlay button {
      background: rgba(142, 197, 255, 0.12);
      border: 1px solid rgba(142, 197, 255, 0.3);
      color: #8ec5ff;
      font: inherit;
      border-radius: 6px;
      padding: 4px 10px;
      cursor: pointer;
    }
    #sync-debug-overlay button:hover {
      background: rgba(142, 197, 255, 0.2);
    }
  `;
  document.head.appendChild(style);
};

const buildUpcomingTimeline = (st, secPerBeatValue, now) => {
  if (!Number.isFinite(st?.nextNoteTime) || !Number.isFinite(secPerBeatValue) || secPerBeatValue <= 0) return [];
  const beatsPerBar = Math.max(1, st?.beatsPerBar || 1);
  const midi = st?.midi ?? {};
  const scheduledBeats = midi.scheduledBeats ?? 0;
  const countInBeats = midi.countInBeats ?? 0;
  let beatInBar = ((st?.curBeatInBar ?? (beatsPerBar - 1)) + 1) % beatsPerBar;
  const entries = [];
  for (let i = 0; i < 6; i++) {
    const beatIndex = scheduledBeats + i;
    const beatStart = st.nextNoteTime + i * secPerBeatValue;
    const delta = Number.isFinite(now) ? beatStart - now : Number.NaN;
    const barNumber = Math.floor(beatIndex / beatsPerBar) + 1;
    const timelineIndex = beatIndex - countInBeats;
    const isCountIn = beatIndex < countInBeats;
    const midiEvents = [];
    if (!isCountIn && Array.isArray(midi.timeline) && timelineIndex >= 0 && timelineIndex < midi.timeline.length) {
      const events = midi.timeline[timelineIndex] || [];
      events.forEach((event) => {
        const offset = Math.max(0, event.offset ?? 0);
        const startTime = beatStart + offset * secPerBeatValue;
        midiEvents.push({
          note: event.note,
          name: midiNoteName(event.note),
          offset,
          startTime,
          delta: Number.isFinite(now) ? startTime - now : Number.NaN,
        });
      });
    }
    entries.push({
      beatIndex,
      beatLabel: `Bar ${barNumber} · Beat ${beatInBar + 1}`,
      time: beatStart,
      delta,
      isCountIn,
      midiEvents,
    });
    beatInBar = (beatInBar + 1) % beatsPerBar;
  }
  return entries;
};

export function mountSyncDebug(st, opts = {}) {
  if (typeof document === 'undefined' || !st) return () => {};
  if (window.__mtSyncDebugClosed) return () => {};
  if (document.getElementById('sync-debug-overlay')) return () => {};

  ensureStyle();

  const root = document.createElement('aside');
  root.id = 'sync-debug-overlay';
  root.innerHTML = `
    <h5>Sync Inspector</h5>
    <div class="section">
      <div class="kv"><span>Audio now</span><span data-audio-now>—</span></div>
      <div class="kv"><span>Next beat</span><span data-next-beat>—</span></div>
      <div class="kv"><span>Delta</span><span data-delta>—</span></div>
      <div class="kv"><span>BPM</span><span data-bpm>—</span></div>
    </div>
    <div class="section">
      <strong>Upcoming Timeline</strong>
      <ul class="timeline-list" data-timeline></ul>
    </div>
    <div class="section">
      <strong>Recent Beats</strong>
      <ul class="timeline-list" data-history></ul>
    </div>
    <div class="section">
      <div class="kv"><span>Anchor</span><span data-anchor>—</span></div>
      <div class="kv"><span>Count-in</span><span data-countin>—</span></div>
    </div>
    <div class="section" data-actions>
      <button type="button" class="resync-btn">Force Resync</button>
      <button type="button" class="log-btn">Log Snapshot</button>
      <button type="button" class="close-btn">Close</button>
    </div>
  `;

  document.body.appendChild(root);

  const els = {
    audioNow: root.querySelector('[data-audio-now]'),
    nextBeat: root.querySelector('[data-next-beat]'),
    delta: root.querySelector('[data-delta]'),
    bpm: root.querySelector('[data-bpm]'),
    timelineList: root.querySelector('[data-timeline]'),
    historyList: root.querySelector('[data-history]'),
    anchor: root.querySelector('[data-anchor]'),
    countIn: root.querySelector('[data-countin]'),
    resyncBtn: root.querySelector('.resync-btn'),
    logBtn: root.querySelector('.log-btn'),
    closeBtn: root.querySelector('.close-btn'),
  };

  const recentBeats = [];
  const maxRecent = 6;

  const getSecPerBeat = () => {
    try {
      return opts.secPerBeat?.();
    } catch (_) {
      return Number.NaN;
    }
  };

  const renderTimeline = (container, items) => {
    if (!container) return;
    container.innerHTML = '';
    items.forEach((item) => {
      const li = document.createElement('li');
      if (item.isCountIn) li.classList.add('countin');
      const nowStatus = item.delta;
      if (!item.isCountIn) {
        const minDelta = item.midiEvents.reduce((acc, evt) => Math.min(acc, evt.delta ?? Infinity), Infinity);
        if (minDelta < -0.02) li.classList.add('lag');
        else if (minDelta > (item.midiEvents.length ? 0.15 : 0.4)) li.classList.add('lead');
      }
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${item.beatLabel}${item.isCountIn ? ' (count-in)' : ''}</span><span>${formatTime(item.time)} • ${formatDelta(nowStatus)}</span>`;
      li.appendChild(row);
      if (item.midiEvents.length) {
        const notes = document.createElement('div');
        notes.className = 'notes';
        item.midiEvents.forEach((evt) => {
          const span = document.createElement('span');
          span.textContent = `${evt.name} @ ${formatDelta(evt.delta)} (offset ${evt.offset.toFixed(2)} beat)`;
          notes.appendChild(span);
        });
        li.appendChild(notes);
      }
      container.appendChild(li);
    });
  };

  const renderHistory = (container, items, now) => {
    if (!container) return;
    container.innerHTML = '';
    items.forEach((item) => {
      const li = document.createElement('li');
      if (item.isCountIn) li.classList.add('countin');
      const beatDelta = Number.isFinite(now) ? item.beatStartTime - now : Number.NaN;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>#${item.beatIndex}${item.isCountIn ? ' (count-in)' : ''}</span><span>${formatTime(item.beatStartTime)} • ${formatDelta(beatDelta)}</span>`;
      li.appendChild(row);
      if (item.events?.length) {
        const notes = document.createElement('div');
        notes.className = 'notes';
        item.events.forEach((evt) => {
          const span = document.createElement('span');
          span.textContent = `${midiNoteName(evt.note)} at ${formatTime(evt.startTime)} • ${formatDelta(evt.startTime - now)}`;
          notes.appendChild(span);
        });
        li.appendChild(notes);
      }
      container.appendChild(li);
    });
  };

  const snapshot = () => {
    const ctx = st.audioCtx;
    const now = ctx?.currentTime ?? Number.NaN;
    const secPerBeat = getSecPerBeat();
    const timeline = buildUpcomingTimeline(st, secPerBeat, now);
    return {
      now,
      nextBeatTime: st.nextNoteTime ?? Number.NaN,
      delta: Number.isFinite(now) && Number.isFinite(st.nextNoteTime) ? st.nextNoteTime - now : Number.NaN,
      bpm: st.bpm,
      timeline,
      midiState: {
        countInBeats: st.midi?.countInBeats,
        scheduledBeats: st.midi?.scheduledBeats,
        totalBeats: st.midi?.totalBeats,
        barEstimate: st.midi?.barEstimate,
        timeSignature: st.midi?.timeSignature,
      },
    };
  };

  const render = () => {
    const ctx = st.audioCtx;
    const now = ctx?.currentTime ?? Number.NaN;
    const secPerBeat = getSecPerBeat();
    const nextBeatTime = st.nextNoteTime ?? Number.NaN;
    const delta = Number.isFinite(nextBeatTime) && Number.isFinite(now) ? nextBeatTime - now : Number.NaN;

    if (els.audioNow) els.audioNow.textContent = formatTime(now);
    if (els.nextBeat) els.nextBeat.textContent = formatTime(nextBeatTime);
    if (els.delta) els.delta.textContent = formatDelta(delta);
    if (els.bpm) els.bpm.textContent = Number.isFinite(st.bpm) ? st.bpm.toFixed(2) : '—';

    const timeline = buildUpcomingTimeline(st, secPerBeat, now);
    renderTimeline(els.timelineList, timeline);
    renderHistory(els.historyList, recentBeats, now);

    if (els.anchor) {
      if (st.midi?.loaded) {
        const anchor = st.midi.anchorTime;
        const offset = st.midi.offsetBeats ?? 0;
        els.anchor.textContent = `${formatTime(anchor)} • offset ${offset.toFixed(2)} beats`;
      } else {
        els.anchor.textContent = '—';
      }
    }

    if (els.countIn) {
      const midiState = st.midi ?? {};
      if (st.midi?.loaded) {
        const sig = midiState.timeSignature;
        const sigLabel = sig?.numerator && sig?.denominator ? `${sig.numerator}/${sig.denominator}` : '—';
        const bars = Number.isFinite(midiState.barEstimate) ? midiState.barEstimate.toFixed(2) : '—';
        els.countIn.textContent = `Count-in ${st.countInBars ?? 0} bars • ${sigLabel} • ~${bars} bars total`;
      } else {
        els.countIn.textContent = `Count-in ${st.countInBars ?? 0} bars`;
      }
    }
  };

  const handleBeatEvent = (info) => {
    recentBeats.unshift({
      beatIndex: info.beatIndex,
      beatStartTime: info.beatStartTime,
      beatDuration: info.beatDuration,
      isCountIn: info.isCountInBeat,
      events: info.events,
    });
    if (recentBeats.length > maxRecent) recentBeats.pop();
  };

  if (typeof opts.registerBeatListener === 'function') {
    opts.registerBeatListener(handleBeatEvent);
  }

  let frameId = null;
  const loop = () => {
    render();
    frameId = window.requestAnimationFrame(loop);
  };
  loop();

  if (els.resyncBtn) {
    els.resyncBtn.addEventListener('click', () => {
      opts.resync?.();
      render();
    });
  }

  if (els.logBtn) {
    els.logBtn.addEventListener('click', () => {
      const data = snapshot();
      // eslint-disable-next-line no-console
      console.groupCollapsed('[SyncInspector] Snapshot');
      // eslint-disable-next-line no-console
      console.log({
        now: data.now,
        nextBeatTime: data.nextBeatTime,
        delta: data.delta,
        bpm: data.bpm,
        midi: data.midiState,
      });
      if (data.timeline.length) {
        // eslint-disable-next-line no-console
        console.table(
          data.timeline.map((entry) => ({
            Label: entry.beatLabel,
            Time: entry.time,
            Delta: entry.delta,
            CountIn: entry.isCountIn,
            Notes: entry.midiEvents.map((evt) => `${evt.name}@${evt.offset.toFixed(2)}`).join(', '),
          })),
        );
      }
      // eslint-disable-next-line no-console
      console.groupEnd();
    });
  }

  const cleanup = () => {
    if (frameId) window.cancelAnimationFrame(frameId);
    if (typeof opts.registerBeatListener === 'function') opts.registerBeatListener(null);
    if (root.isConnected) root.remove();
  };

  if (els.closeBtn) {
    els.closeBtn.addEventListener('click', () => {
      window.__mtSyncDebugClosed = true;
      cleanup();
    });
  }

  return cleanup;
}
