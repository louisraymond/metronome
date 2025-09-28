import assert from 'node:assert/strict';

const makeBuffer = (bytes) => Uint8Array.from(bytes).buffer;

test('parseMidiFile reports time signature and bar estimate', async () => {
  const { parseMidiFile } = await import('../app/midi.js');

  const buffer = makeBuffer([
    // Header chunk
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x00, 0x60,
    // Track chunk
    0x4d, 0x54, 0x72, 0x6b,
    0x00, 0x00, 0x00, 0x14,
    // Time signature meta event: 3/4
    0x00, 0xff, 0x58, 0x04, 0x03, 0x02, 0x18, 0x08,
    // Note on (C4)
    0x00, 0x90, 0x3c, 0x40,
    // Note off after one quarter note
    0x60, 0x80, 0x3c, 0x00,
    // End of track
    0x00, 0xff, 0x2f, 0x00,
  ]);

  const result = parseMidiFile(buffer);

  assert.deepEqual(result.timeSignature, { numerator: 3, denominator: 4 });
  assert.ok(Math.abs(result.totalBeats - 1) < 1e-6, 'expected one quarter note worth of beats');
  assert.ok(Math.abs(result.barEstimate - (1 / 3)) < 1e-6, 'expected roughly a third of a bar in 3/4');
});
