export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const median = (arr) => {
  const s = [...arr].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
