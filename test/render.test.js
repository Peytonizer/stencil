import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { buildPdf } from '../src/pdf/render.js';
import { para, text } from './helpers.js';

// A 1×1 red PNG.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const template = (blocks) => ({ name: 'Test notice', build: () => blocks });

describe('buildPdf', () => {
  it('produces a readable PDF with one page per laid-out page', async () => {
    const long = para([text(Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'))]);
    const bytes = await buildPdf(template([long]), {});
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getTitle()).toBe('Test notice');
  });

  it('embeds an image and its border', async () => {
    const image = { bytes: PNG, type: 'png', width: 1, height: 1 };
    const bytes = await buildPdf(
      template([{ type: 'image', image, x: 0, border: true }, { type: 'letterhead', image }]),
      {},
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('does not throw on a character the fonts cannot draw', async () => {
    await expect(buildPdf(template([para([text('tick ✓')])]), {})).resolves.toBeInstanceOf(Uint8Array);
  });

  it('builds a blank page from no blocks', async () => {
    const doc = await PDFDocument.load(await buildPdf(template([]), {}));
    expect(doc.getPageCount()).toBe(1);
  });
});
