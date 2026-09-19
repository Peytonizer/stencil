import { beforeAll, describe, expect, it } from 'vitest';

import { justifyExtra, printable, wrapRuns } from '../src/pdf/flow.js';
import { loadFonts, LOREM } from './helpers.js';

let fonts;
beforeAll(async () => {
  fonts = await loadFonts();
});

const runs = (t, extra = {}) => [{ text: t, size: 12, ...extra }];
const lineText = (line) => line.pieces.map((p) => p.text).join('');

describe('wrapRuns', () => {
  it('wraps to the width and marks only the final line as last', () => {
    const lines = wrapRuns(runs(LOREM.repeat(2)), fonts, 300);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) {
      const used = line.pieces.reduce((sum, p) => sum + p.width, 0);
      expect(used).toBeLessThanOrEqual(300);
    }
    expect(lines.map((l) => l.last)).toEqual(lines.map((_, i) => i === lines.length - 1));
  });

  it('leaves no space at either end of a line', () => {
    for (const line of wrapRuns(runs(LOREM), fonts, 200)) {
      const t = lineText(line);
      expect(t).toBe(t.trim());
    }
  });

  it('keeps a double space inside a line', () => {
    const [line] = wrapRuns(runs('Full stop.  Next'), fonts, 400);
    expect(lineText(line)).toBe('Full stop.  Next');
  });

  it('lets a word longer than the width overflow rather than break it', () => {
    const [line] = wrapRuns(runs('Supercalifragilisticexpialidocious'), fonts, 40);
    expect(lineText(line)).toBe('Supercalifragilisticexpialidocious');
  });

  it('ends a line at a newline and keeps a blank line between two of them', () => {
    const lines = wrapRuns(runs('one\n\ntwo'), fonts, 400);
    expect(lines.map(lineText)).toEqual(['one', '', 'two']);
    expect(lines.map((l) => l.last)).toEqual([true, true, true]);
  });

  it('does not add an empty line for a trailing newline', () => {
    expect(wrapRuns(runs('one\n'), fonts, 400)).toHaveLength(1);
  });

  it('switches font inside a line', () => {
    const [line] = wrapRuns([...runs('plain '), ...runs('bold', { bold: true })], fonts, 400);
    expect(line.pieces.map((p) => p.run.bold)).toEqual([undefined, undefined, true]);
  });
});

describe('justifyExtra', () => {
  it('spreads the slack over the spaces, and stretches nothing on a last line', () => {
    const [first, ...rest] = wrapRuns(runs(LOREM), fonts, 300);
    const used = first.pieces.reduce((sum, p) => sum + p.width, 0);
    const gaps = first.pieces.filter((p) => p.text.trim() === '').length;
    expect(justifyExtra(first, 300)).toBeCloseTo((300 - used) / gaps, 6);
    expect(justifyExtra(rest[rest.length - 1], 300)).toBe(0);
  });

  it('leaves a line with no spaces, or one already too wide, alone', () => {
    const [word] = wrapRuns(runs('Supercalifragilisticexpialidocious next'), fonts, 40);
    expect(justifyExtra({ ...word, last: false }, 40)).toBe(0);
  });
});

describe('printable', () => {
  it('replaces what WinAnsi cannot draw with a visible question mark', () => {
    expect(printable('tick ✓ done 😀', fonts)).toBe('tick ? done ?');
  });

  it('keeps accents and curly quotes, which WinAnsi has', () => {
    expect(printable('café “quoted” – dash', fonts)).toBe('café “quoted” – dash');
  });

  it('normalises non-breaking spaces, zero-width characters, tabs and CRLF', () => {
    expect(printable('a b​c\td\r\ne', fonts)).toBe('a bc d\ne');
  });

  it('means one unencodable character can never throw while wrapping', () => {
    expect(() => wrapRuns(runs('emoji 😀 here'), fonts, 300)).not.toThrow();
  });
});
