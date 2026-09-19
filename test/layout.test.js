import { beforeAll, describe, expect, it } from 'vitest';

import { CONTENT, LETTERHEAD, MEASURE, leading } from '../src/pdf/geometry.js';
import { layoutBlocks } from '../src/pdf/layout.js';
import { fakeImage, loadFonts, LOREM, para, text } from './helpers.js';

let fonts;
beforeAll(async () => {
  fonts = await loadFonts();
});

const L12 = leading(12);
/** How many 12 pt lines fit on a page: 656.44 / 14.4 = 45.6. */
const LINES_PER_PAGE = 45;

const texts = (page) => page.ops.filter((op) => op.op === 'text');
const lineOps = (page) => texts(page).map((op) => op.text);
const blank = { type: 'blank' };
/** A paragraph that lays out as exactly `n` lines: one short line each, split by newlines. */
const lines = (n, extra = {}) => para([text(Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n'))], extra);

describe('wrapping and the measure', () => {
  it('starts the first baseline inside the top margin and keeps text within the measure', () => {
    const [page] = layoutBlocks([para([text(LOREM.repeat(3))])], fonts);
    expect(page.ops.length).toBeGreaterThan(2);
    for (const op of texts(page)) {
      expect(op.x).toBeGreaterThanOrEqual(CONTENT.left - 0.01);
      expect(op.x + op.width).toBeLessThanOrEqual(CONTENT.right + 0.01);
      expect(op.y).toBeLessThan(CONTENT.top);
    }
  });

  it('steps down by the leading for each line', () => {
    const [page] = layoutBlocks([lines(3)], fonts);
    const ys = texts(page).map((op) => op.y);
    expect(ys[0] - ys[1]).toBeCloseTo(L12, 6);
    expect(ys[1] - ys[2]).toBeCloseTo(L12, 6);
  });

  it('indents a paragraph by its x and wraps at the narrower width', () => {
    const [page] = layoutBlocks([para([text(LOREM.repeat(2))], { x: 72 })], fonts);
    for (const op of texts(page)) {
      expect(op.x).toBeGreaterThanOrEqual(CONTENT.left + 72 - 0.01);
      expect(op.x + op.width).toBeLessThanOrEqual(CONTENT.right + 0.01);
    }
  });

  it('draws unjustified lines as a single string so the text can be searched', () => {
    const [page] = layoutBlocks([para([text('one two three')])], fonts);
    expect(lineOps(page)).toEqual(['one two three']);
  });
});

const item = (extra = {}) => ({
  type: 'item',
  marker: '1.',
  markerX: 18,
  x: 36,
  align: 'left',
  size: 12,
  runs: [text(LOREM)],
  ...extra,
});

describe('items', () => {
  it('draws the marker once, on the first line, and hangs the text at x', () => {
    const [page] = layoutBlocks([item()], fonts);
    const ops = texts(page);
    expect(ops.filter((op) => op.text === '1.')).toHaveLength(1);
    expect(ops[0]).toMatchObject({ text: '1.', x: CONTENT.left + 18 });
    const body = ops.slice(1);
    expect(body.length).toBeGreaterThan(1);
    for (const op of body) expect(op.x).toBeCloseTo(CONTENT.left + 36, 6);
  });

  it('draws a bold marker when asked', () => {
    const [page] = layoutBlocks([item({ markerBold: true })], fonts);
    expect(texts(page)[0].font).toBe('bold');
  });
});

describe('justification', () => {
  it('ends every justified line except the last exactly at the right edge', () => {
    const [page] = layoutBlocks([para([text(LOREM.repeat(3))], { align: 'justify' })], fonts);
    const rows = new Map();
    for (const op of texts(page)) rows.set(op.y, [...(rows.get(op.y) ?? []), op]);
    const ordered = [...rows.entries()].toSorted((a, b) => b[0] - a[0]).map(([, ops]) => ops);
    expect(ordered.length).toBeGreaterThan(2);
    for (const row of ordered.slice(0, -1)) {
      const words = row.filter((op) => op.text.trim() !== '');
      const end = words[words.length - 1];
      expect(Math.abs(end.x + end.width - CONTENT.right)).toBeLessThan(0.01);
    }
    const last = ordered[ordered.length - 1];
    const lastEnd = last[last.length - 1];
    expect(lastEnd.x + lastEnd.width).toBeLessThan(CONTENT.right - 1);
  });

  it('justifies a hanging item to the same right edge', () => {
    const [page] = layoutBlocks(
      [{ type: 'item', marker: '1.', markerX: 18, x: 36, align: 'justify', size: 12, runs: [text(LOREM.repeat(2))] }],
      fonts,
    );
    const first = texts(page).filter((op) => op.y === texts(page)[1].y && op.text.trim() !== '');
    const end = first[first.length - 1];
    expect(Math.abs(end.x + end.width - CONTENT.right)).toBeLessThan(0.01);
  });

  it('leaves a line that ends at a hard break unjustified', () => {
    const [page] = layoutBlocks(
      [para([text(`${LOREM}\nshort`)], { align: 'justify' })],
      fonts,
    );
    const short = texts(page).find((op) => op.text === 'short');
    expect(short.x).toBeCloseTo(CONTENT.left, 6);
  });
});

describe('hard line breaks', () => {
  it("keeps the user's line breaks and a blank line between them", () => {
    const [page] = layoutBlocks([para([text('first\n\nthird')])], fonts);
    const ys = texts(page).map((op) => op.y);
    expect(lineOps(page)).toEqual(['first', 'third']);
    expect(ys[0] - ys[1]).toBeCloseTo(2 * L12, 6);
  });
});

describe('blanks', () => {
  it('is one line at 12 pt leading', () => {
    const [page] = layoutBlocks([lines(1), blank, lines(1)], fonts);
    const ys = texts(page).map((op) => op.y);
    expect(ys[0] - ys[1]).toBeCloseTo(2 * L12, 6);
  });

  it('is dropped when it lands at the top of a page', () => {
    const pages = layoutBlocks([lines(LINES_PER_PAGE), blank, lines(1)], fonts);
    expect(pages).toHaveLength(2);
    const first = texts(pages[1])[0];
    // Baseline of a first line directly under the top margin, not one line lower.
    const [reference] = layoutBlocks([lines(1)], fonts);
    expect(first.y).toBeCloseTo(texts(reference)[0].y, 6);
  });
});

describe('pagination', () => {
  it('splits a paragraph between lines when it runs off a page', () => {
    const pages = layoutBlocks([lines(LINES_PER_PAGE + 5)], fonts);
    expect(pages).toHaveLength(2);
    expect(texts(pages[0])).toHaveLength(LINES_PER_PAGE);
    expect(texts(pages[1])).toHaveLength(5);
    for (const op of texts(pages[0])) expect(op.y).toBeGreaterThan(CONTENT.bottom);
  });

  it('starts every page at the same height', () => {
    const pages = layoutBlocks([lines(LINES_PER_PAGE * 2 + 1)], fonts);
    expect(pages).toHaveLength(3);
    const firsts = pages.map((page) => texts(page)[0].y);
    expect(new Set(firsts.map((y) => y.toFixed(6))).size).toBe(1);
  });
});

describe('keep', () => {
  it('moves a group that does not fit to the next page whole', () => {
    const pages = layoutBlocks(
      [lines(LINES_PER_PAGE - 3), { type: 'keep', blocks: [lines(5)] }],
      fonts,
    );
    expect(pages).toHaveLength(2);
    expect(texts(pages[0])).toHaveLength(LINES_PER_PAGE - 3);
    expect(texts(pages[1])).toHaveLength(5);
  });

  it('leaves a group that fits where it is', () => {
    const pages = layoutBlocks([lines(10), { type: 'keep', blocks: [lines(5)] }], fonts);
    expect(pages).toHaveLength(1);
  });

  it('lays out a group taller than a page normally rather than looping', () => {
    const pages = layoutBlocks([{ type: 'keep', blocks: [lines(LINES_PER_PAGE + 5)] }], fonts);
    expect(pages).toHaveLength(2);
  });
});

describe('keepWithNext', () => {
  it('moves a heading to the next page when there is no room for a line after it', () => {
    const heading = para([text('SCHEDULE A', { bold: true })], { keepWithNext: true });
    const pages = layoutBlocks([lines(LINES_PER_PAGE - 1), heading, lines(2)], fonts);
    expect(pages).toHaveLength(2);
    expect(lineOps(pages[1])[0]).toBe('SCHEDULE A');
  });

  it('carries the heading through the blank line after it', () => {
    const heading = para([text('SCHEDULE A', { bold: true })], { keepWithNext: true });
    // Room for the heading and the blank, but not for the paragraph's first line.
    const pages = layoutBlocks([lines(LINES_PER_PAGE - 2), heading, blank, lines(2)], fonts);
    expect(lineOps(pages[1])[0]).toBe('SCHEDULE A');
  });

  it('chains through a following keep-with-next heading', () => {
    const h1 = para([text('One', { bold: true })], { keepWithNext: true });
    const h2 = para([text('Two', { bold: true })], { keepWithNext: true });
    const pages = layoutBlocks([lines(LINES_PER_PAGE - 4), h1, blank, h2, blank, lines(2)], fonts);
    expect(lineOps(pages[1])[0]).toBe('One');
  });

  it('carries a heading to the next page with a kept group that will not fit beside it', () => {
    // Deliberate: clause 3 travels with the seal block rather than being left behind on its own
    // page. Open for review; see the note in layout.js.
    const heading = para([text('Three', { bold: true })], { keepWithNext: true });
    const seal = { type: 'keep', blocks: [lines(6)] };
    const pages = layoutBlocks([lines(LINES_PER_PAGE - 6), heading, blank, seal], fonts);
    expect(pages).toHaveLength(2);
    expect(lineOps(pages[1])[0]).toBe('Three');
  });

  it('does nothing when the next line fits', () => {
    const heading = para([text('SCHEDULE A', { bold: true })], { keepWithNext: true });
    expect(layoutBlocks([lines(10), heading, blank, lines(2)], fonts)).toHaveLength(1);
  });
});

describe('images', () => {
  it('scales to the measure but never enlarges past 1 px = 1 pt', () => {
    const [page] = layoutBlocks(
      [{ type: 'image', image: fakeImage(2000, 100), x: 36 }, { type: 'image', image: fakeImage(100, 50), x: 0 }],
      fonts,
    );
    const [wide, small] = page.ops;
    expect(wide.width).toBeCloseTo(MEASURE - 36, 6);
    expect(wide.height).toBeCloseTo(((MEASURE - 36) / 2000) * 100, 6);
    expect(small).toMatchObject({ width: 100, height: 50 });
  });

  it('caps the height at 300 pt', () => {
    const [page] = layoutBlocks([{ type: 'image', image: fakeImage(100, 1000), x: 0 }], fonts);
    expect(page.ops[0].height).toBeCloseTo(300, 6);
    expect(page.ops[0].width).toBeCloseTo(30, 6);
  });

  it('honours a smaller box, as the seal has', () => {
    const [page] = layoutBlocks(
      [{ type: 'image', image: fakeImage(600, 600), x: 18, maxWidth: 180, maxHeight: 140 }],
      fonts,
    );
    expect(page.ops[0]).toMatchObject({ x: CONTENT.left + 18, height: 140, width: 140 });
  });

  it('moves to the next page when it does not fit the room left', () => {
    const pages = layoutBlocks(
      [lines(LINES_PER_PAGE - 2), { type: 'image', image: fakeImage(300, 200), x: 0 }],
      fonts,
    );
    expect(pages).toHaveLength(2);
    expect(pages[1].ops[0].op).toBe('image');
    expect(pages[1].ops[0].y).toBeCloseTo(CONTENT.top - 200, 6);
  });

  it('asks for a border when the block does', () => {
    const [page] = layoutBlocks([{ type: 'image', image: fakeImage(50, 50), x: 0, border: true }], fonts);
    expect(page.ops[0].border).toBe(true);
  });
});

const images = (page) => page.ops.filter((op) => op.op === 'image');

describe('the letterhead', () => {
  it('sits in the header band without taking room from the text', () => {
    const withLetterhead = layoutBlocks(
      [{ type: 'letterhead', image: fakeImage(900, 90) }, lines(1)],
      fonts,
    );
    const without = layoutBlocks([lines(1)], fonts);
    const [image] = images(withLetterhead[0]);
    expect(image.x).toBe(LETTERHEAD.x);
    expect(image.y + image.height).toBeCloseTo(LETTERHEAD.top, 6);
    expect(image.y).toBeGreaterThanOrEqual(LETTERHEAD.bottom - 0.01);
    expect(image.width).toBeLessThanOrEqual(MEASURE + 0.01);
    expect(texts(withLetterhead[0])[0].y).toBeCloseTo(texts(without[0])[0].y, 6);
  });

  it('is scaled down to the band', () => {
    const [page] = layoutBlocks([{ type: 'letterhead', image: fakeImage(300, 300) }, lines(1)], fonts);
    expect(images(page)[0].height).toBeCloseTo(LETTERHEAD.top - LETTERHEAD.bottom, 6);
  });

  it('is the header of every page, in the same place', () => {
    const image = fakeImage(900, 90);
    const pages = layoutBlocks(
      [{ type: 'letterhead', image }, lines(LINES_PER_PAGE * 2 + 1)],
      fonts,
    );
    expect(pages).toHaveLength(3);
    const placed = pages.map((page) => images(page));
    for (const list of placed) expect(list).toHaveLength(1);
    const [first, ...rest] = placed.map(([op]) => op);
    for (const op of rest) expect(op).toEqual(first);
    for (const op of placed.flat()) expect(op.image).toBe(image);
  });

  it('leaves the text where it would be without a letterhead, on every page', () => {
    const withLetterhead = layoutBlocks(
      [{ type: 'letterhead', image: fakeImage(900, 90) }, lines(LINES_PER_PAGE + 3)],
      fonts,
    );
    const without = layoutBlocks([lines(LINES_PER_PAGE + 3)], fonts);
    for (const [index, page] of withLetterhead.entries()) {
      expect(texts(page).map((op) => op.y)).toEqual(texts(without[index]).map((op) => op.y));
    }
  });

  it('shows a red placeholder in the band on every page while it is missing', () => {
    const pages = layoutBlocks(
      [{ type: 'letterhead', placeholder: '[Letterhead]' }, lines(LINES_PER_PAGE + 1)],
      fonts,
    );
    expect(pages).toHaveLength(2);
    for (const page of pages) {
      const [placeholder] = texts(page);
      expect(placeholder).toMatchObject({ text: '[Letterhead]', color: { r: 0.8, g: 0, b: 0 } });
      expect(placeholder.y).toBeGreaterThan(LETTERHEAD.bottom);
      expect(placeholder.y).toBeLessThan(LETTERHEAD.top);
    }
  });
});

describe('runs', () => {
  it('draws a missing value in red and everything else in the default colour', () => {
    const [page] = layoutBlocks([para([text('Dear '), text('[Owner Name]', { missing: true })])], fonts);
    expect(texts(page).map((op) => op.color)).toEqual([null, { r: 0.8, g: 0, b: 0 }]);
  });

  it('carries bold and italic through to the font', () => {
    const [page] = layoutBlocks(
      [para([text('a', { bold: true }), text('b', { italic: true }), text('c', { bold: true, italic: true })])],
      fonts,
    );
    expect(texts(page).map((op) => op.font)).toEqual(['bold', 'italic', 'boldItalic']);
  });
});
