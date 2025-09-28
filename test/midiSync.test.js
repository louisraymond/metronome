import assert from 'node:assert/strict';

test('computeNoteTime aligns MIDI notes with the current tempo', async () => {
  const mod = await import('../app/audio.js');
  const { computeNoteTime } = mod;

  assert.strictEqual(typeof computeNoteTime, 'function', 'computeNoteTime export is missing');

  const quarter = 0.5; // 120 BPM at quarter-note beat unit
  const firstNoteTime = computeNoteTime({
    noteBeat: 0,
    offsetBeats: 0,
    anchorTime: 2,
    secPerBeat: quarter,
  });

  assert.ok(Math.abs(firstNoteTime - 2) < 1e-9, 'first note should start at anchor time');

  const faster = 60 / 180; // ≈ 0.333...
  const eighthBeat = computeNoteTime({
    noteBeat: 8,
    offsetBeats: 0,
    anchorTime: 4,
    secPerBeat: faster,
  });

  assert.ok(Math.abs(eighthBeat - (4 + 8 * faster)) < 1e-9, 'note should scale from anchor with current tempo');

  const withCountIn = computeNoteTime({
    noteBeat: 0,
    offsetBeats: 4,
    anchorTime: 1,
    secPerBeat: quarter,
  });

  assert.ok(Math.abs(withCountIn - (1 + 4 * quarter)) < 1e-9, 'count-in offset should push note later');
});
