/*
  Gets a screenshot ready to be read: decoded, enlarged and re-encoded as a PNG.

  The Lot/Owner screen's text is about 10 px tall, at the low end of what Tesseract reads well,
  so the image is enlarged first. The enlargement is undone when the word boxes come back, so the
  parser works in the screenshot's own pixels.

  Decoding and encoding use a canvas, so this file needs a browser and has no test. The enlarging
  (upscale.js) and the guessing (parse.js) are pure and are tested.
*/

import { upscale } from './upscale.js';

/** Enlarge by this much, or by less if that would pass MAX_SIDE. Tesseract is happiest with text
 *  about 30 px tall, and 3 takes this screen's 10 px text there. */
const SCALE = 3;
const MAX_SIDE = 4096;

/**
 * `file` is a File or Blob holding a PNG or JPEG. Returns `{ bytes, scale }`: PNG bytes, and how
 * many times larger they are than the original.
 */
export async function prepareForOcr(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.max(1, Math.min(SCALE, Math.floor(MAX_SIDE / Math.max(width, height))));

  // Read the pixels at their own size and enlarge them here. See upscale.js for why the canvas
  // isn't left to do it.
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  sourceContext.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = sourceContext.getImageData(0, 0, width, height).data;

  const target = document.createElement('canvas');
  target.width = width * scale;
  target.height = height * scale;
  target
    .getContext('2d')
    .putImageData(new ImageData(upscale(pixels, width, height, scale), target.width, target.height), 0, 0);

  const png = await new Promise((resolve) => target.toBlob(resolve, 'image/png'));
  return { bytes: new Uint8Array(await png.arrayBuffer()), scale };
}
