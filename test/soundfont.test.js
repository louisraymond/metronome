import assert from 'node:assert/strict';

test('soundfont registry exposes built-in definitions', async () => {
  const mod = await import('../app/soundfont.js');
  assert.ok(Array.isArray(mod.soundfonts), 'soundfonts array missing');
  assert.ok(mod.soundfonts.find((sf) => sf.id === 'rhodes-j3'), 'missing rhodes preset');
});

test('resolveSoundfont throws for unknown id', async () => {
  const { resolveSoundfont } = await import('../app/soundfont.js');
  assert.throws(() => resolveSoundfont('nope'), /Unknown soundfont/);
});
