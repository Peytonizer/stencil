/*
  `prepareImage`'s success path draws through `createImageBitmap` and a `<canvas>`, neither of
  which exist in vitest's default node environment — that path is exercised by hand in a real
  browser instead, as the CSP and the preview are (SPEC.md, build stage 5). What is tested here
  is what doesn't need a DOM: detection by magic bytes, and the rejection path, which is the one
  place a wrong file must produce a message rather than an exception.
*/

import { describe, expect, it } from 'vitest';

import { detectImageType, imageFromClipboardItems, prepareImage } from '../src/images.js';

describe('detectImageType', () => {
  it('recognises a JPEG by its SOI marker', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpeg');
  });

  it('recognises a PNG by its signature', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(detectImageType(png)).toBe('png');
  });

  it('rejects anything else, whatever the browser or the filename claims', () => {
    expect(detectImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull(); // %PDF-
  });

  it('rejects a file too short to carry either signature', () => {
    expect(detectImageType(new Uint8Array([0xff]))).toBeNull();
  });
});

const item = (types) => ({ types, getType: async (t) => `blob:${t}` });

describe('imageFromClipboardItems', () => {
  it('takes the image from a clipboard that also carries other formats', async () => {
    const items = [item(['text/plain']), item(['text/html', 'image/png'])];
    expect(await imageFromClipboardItems(items)).toBe('blob:image/png');
  });

  it('returns null when the clipboard holds no image', async () => {
    expect(await imageFromClipboardItems([item(['text/plain'])])).toBeNull();
    expect(await imageFromClipboardItems([])).toBeNull();
  });
});

describe('prepareImage', () => {
  it('rejects a non-image file with a message, not an exception', async () => {
    const file = { arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer };
    const result = await prepareImage(file, 'The seal');
    expect(result.error).toBe('The seal must be a JPEG or PNG image.');
    expect(result.image).toBeUndefined();
  });
});
