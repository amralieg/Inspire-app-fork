export function formatWhen(value, fallback = '') {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
