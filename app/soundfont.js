export const soundfonts = [
  {
    id: 'rhodes-j3',
    label: 'Rhodes (jRhodes3 SoundFont)',
    file: 'jRhodes3.sfArk',
    format: 'sfArk',
    description: 'Compressed SF2 archive (sfArk). Decompress to SF2 before use in browser.',
  },
];

export function resolveSoundfont(id) {
  const entry = soundfonts.find((sf) => sf.id === id);
  if (!entry) throw new Error(`Unknown soundfont: ${id}`);
  return entry;
}
