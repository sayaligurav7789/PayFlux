export function formatAmount(amount, currency = 'INR') {
  const symbols = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
  const symbol = symbols[currency] || currency + ' ';
  return `${symbol}${(amount / 100).toFixed(2)}`;
}

export function formatTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function truncateId(id) {
  if (!id) return '—';
  return `${id.slice(0, 8)}…`;
}
