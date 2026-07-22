// Date-time formatting and parsing in the NZ/international convention
// (dd/mm/yyyy hh:mm, 24-hour, local time) — used instead of native
// datetime-local inputs, whose display format follows the OS locale and
// cannot be forced to day-first order.

const pad = (n: number) => String(n).padStart(2, '0');

/** Format an ISO timestamp as "dd/mm/yyyy hh:mm" in local time ('' if invalid) */
export function formatNZDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Parse "dd/mm/yyyy hh:mm" (local time, 24-hour; "T" also accepted as the
 * separator) to an ISO timestamp. Returns null for anything else, including
 * impossible dates such as 31/02/2020.
 */
export function parseNZDateTime(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute);
  // Reject rollovers (e.g. 31/02 silently becoming 02/03 or 03/03)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

  return date.toISOString();
}
