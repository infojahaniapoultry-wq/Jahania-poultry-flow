export function openWhatsApp(message: string) {
  if (typeof window === 'undefined') return;

  const url = `https://wa.me/?text=${encodeURIComponent(message.trim())}`;
  const popup = window.open(url, '_blank', 'noopener,noreferrer');

  // Some browsers block a new tab. Keep the action useful in that case.
  if (!popup) window.location.assign(url);
}

export function formatShareCurrency(value: unknown) {
  return `Rs. ${Number(value ?? 0).toLocaleString('en-PK')}`;
}

export function formatShareDate(value: string | Date) {
  return new Date(value).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function makeWhatsAppMessage(title: string, lines: string[]) {
  return [`*Jahania Poultry*`, `*${title}*`, '', ...lines.filter(Boolean), '', 'Generated from PoultryFlow'].join('\n');
}
