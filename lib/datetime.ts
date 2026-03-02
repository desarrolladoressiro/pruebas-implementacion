const AR_LOCALE = 'es-AR';
const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';

export function formatDateTimeAr(value: unknown) {
  if (!value) {
    return '-';
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const formatted = new Intl.DateTimeFormat(AR_LOCALE, {
    timeZone: AR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);

  return `${formatted}`;
}
