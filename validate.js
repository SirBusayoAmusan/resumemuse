// Small shared helpers. Word counting is deliberately the same rule the
// browser uses, so client and server never disagree about a limit.

export function words(s) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s ? s.split(' ') : [];
}

export function clampWords(s, max) {
  const w = words(s);
  if (w.length <= max) return (s || '').trim();
  return w.slice(0, max).join(' ');
}
