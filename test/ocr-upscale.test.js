import { describe, expect, it } from 'vitest';
import { upscale } from '../src/ocr/upscale.js';

/** A one-row image of grey pixels with the given values, as RGBA. */
const row = (...greys) => Uint8ClampedArray.from(greys.flatMap((g) => [g, g, g, 255]));
const reds = (pixels) => Array.from({ length: pixels.length / 4 }, (_, i) => pixels[i * 4]);

describe('upscale', () => {
  it('gives the size asked for', () => {
    const out = upscale(row(0, 100, 200), 3, 1, 3);
    expect(out).toHaveLength(9 * 3 * 4);
  });

  it('interpolates between pixels and holds the edges', () => {
    // Centres aligned: a 2-pixel row doubled has output centres at source positions -0.25, 0.25,
    // 0.75 and 1.25, the outer two clamped to the edge pixels.
    // The output is 4 wide and 2 tall (both dimensions grow), so read its first row.
    expect(reds(upscale(row(0, 100), 2, 1, 2)).slice(0, 4)).toEqual([0, 25, 75, 100]);
  });

  it('interpolates vertically as well', () => {
    const column = Uint8ClampedArray.from([0, 0, 0, 255, 100, 100, 100, 255]);
    // 2 wide and 4 tall: the first column is every second pixel.
    const first = reds(upscale(column, 1, 2, 2)).filter((_, i) => i % 2 === 0);
    expect(first).toEqual([0, 25, 75, 100]);
  });

  it('leaves a flat image flat, alpha included', () => {
    const out = upscale(row(80, 80, 80, 80), 2, 2, 3);
    expect(new Set(out)).toEqual(new Set([80, 255]));
  });

  it('with a factor of 1 returns the same pixels', () => {
    const input = row(10, 20, 30);
    expect([...upscale(input, 3, 1, 1)]).toEqual([...input]);
  });
});
