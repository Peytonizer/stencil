import { describe, expect, it } from 'vitest';

import { addDays, formatDate, formatShortMonth, todayInCanberra } from '../src/format.js';

describe('formatDate', () => {
  it('writes DD/MM/YYYY', () => {
    expect(formatDate('2026-09-05')).toBe('05/09/2026');
  });

  it('returns an empty string for an empty or malformed date', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate('26/09/2026')).toBe('');
  });
});

describe('formatShortMonth', () => {
  it('writes D MMM YYYY with no leading zero on the day', () => {
    expect(formatShortMonth('2026-09-19')).toBe('19 Sep 2026');
    expect(formatShortMonth('2026-03-05')).toBe('5 Mar 2026');
  });

  it('spells every month the same way regardless of locale', () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      formatShortMonth(`2026-${String(i + 1).padStart(2, '0')}-01`).split(' ')[1],
    );
    expect(months).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  });

  it('returns an empty string for an empty or impossible date', () => {
    expect(formatShortMonth('')).toBe('');
    expect(formatShortMonth('2026-13-01')).toBe('');
  });
});

describe('addDays', () => {
  it('adds within a month', () => {
    expect(addDays('2026-09-19', 7)).toBe('2026-09-26');
  });

  it('carries across a month end', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
  });

  it('carries across a year end and a leap day', () => {
    expect(addDays('2026-12-30', 7)).toBe('2027-01-06');
    expect(addDays('2028-02-25', 7)).toBe('2028-03-03');
  });

  it('is not moved by daylight saving', () => {
    // ACT clocks go forward on 2026-10-04.
    expect(addDays('2026-10-01', 7)).toBe('2026-10-08');
  });

  it('subtracts, and returns an empty string for an empty date', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('', 7)).toBe('');
  });
});

describe('todayInCanberra', () => {
  it('is the date in Canberra, not in UTC', () => {
    // 23:00 UTC on the 18th is already the 19th in Canberra (UTC+10 in September).
    expect(todayInCanberra(new Date('2026-09-18T23:00:00Z'))).toBe('2026-09-19');
  });
});
