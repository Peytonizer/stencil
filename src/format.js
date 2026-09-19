/*
  Dates, in one place.

  Rules the rest of the app doesn't need to know about:

  - The notice date in the letter heading is `D MMM YYYY` ("19 Sep 2026"), and the confirm-by
    date in the remedies is `DD/MM/YYYY`. Both follow the placeholders in the source template.
  - "Today" is today in Canberra, not today in the browser's time zone. A notice is dated the
    day it is issued under ACT law, and a manager working from Perth — or from a laptop still
    set to somewhere else — must not put yesterday's date on it. `Australia/Canberra` follows
    the ACT's own daylight saving, which is why it is used rather than a fixed +10 offset.
  - Dates are handled as `YYYY-MM-DD` strings and taken apart by hand. `new Date('2026-03-12')`
    is UTC midnight and can print as the 11th.

  Copied from noshow's format.js, with the short-month format and `addDays` added.
*/

const CANBERRA = 'Australia/Canberra';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today in the ACT, as `YYYY-MM-DD` — the shape an `<input type="date">` wants. */
export function todayInCanberra(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CANBERRA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Split `YYYY-MM-DD` into its pieces, or null if it isn't one. */
function split(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
  if (!match) return null;
  return { year: match[1], month: Number(match[2]), day: Number(match[3]), rawMonth: match[2] };
}

/** `YYYY-MM-DD` to `DD/MM/YYYY`. Returns '' for an empty or malformed date. */
export function formatDate(isoDate) {
  const p = split(isoDate);
  if (!p) return '';
  return `${String(p.day).padStart(2, '0')}/${p.rawMonth}/${p.year}`;
}

/** `YYYY-MM-DD` to `D MMM YYYY`, e.g. `19 Sep 2026`. Returns '' for an empty or malformed date. */
export function formatShortMonth(isoDate) {
  const p = split(isoDate);
  if (!p || p.month < 1 || p.month > 12) return '';
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/**
 * `YYYY-MM-DD` plus `n` days, as `YYYY-MM-DD`. Done in UTC so daylight saving can't move the
 * result by a day. Returns '' for an empty or malformed date.
 */
export function addDays(isoDate, n) {
  const p = split(isoDate);
  if (!p) return '';
  const moved = new Date(Date.UTC(Number(p.year), p.month - 1, p.day + n));
  return moved.toISOString().slice(0, 10);
}
