/*
  Enlarges an image by a whole number of times with bilinear interpolation.

  This is done by hand rather than by drawing the image larger on a canvas because a canvas
  decides for itself how to resample, and Chrome's came out as good as nearest-neighbour here:
  the same screenshot read "jane.citizen@example.com" at 90% confidence after a bilinear
  enlargement and as two fragments at 6% and 9% after Chrome's. Text this small (10 px) is what
  the enlargement is for, and smoothing the edges is what makes it readable. Bilinear reads as
  well as bicubic here (a little better on the email address) and is a dozen lines.

  Pixel centres are aligned (a destination pixel's centre is mapped back to the source), which is
  the convention Pillow and browsers use, so the output has no half-pixel drift.
*/

/**
 * `rgba` is RGBA pixel data, `width * height * 4` bytes. Returns the enlarged pixels as a
 * `Uint8ClampedArray` of `width * factor` by `height * factor`.
 */
export function upscale(rgba, width, height, factor) {
  const outWidth = width * factor;
  const outHeight = height * factor;
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);

  // The source position, its lower neighbour and the weight of the upper one, per output column.
  // The same three numbers serve every row, so they are worked out once.
  const columns = Array.from({ length: outWidth }, (_, x) => {
    const at = Math.min(Math.max((x + 0.5) / factor - 0.5, 0), width - 1);
    const low = Math.floor(at);
    return { low, high: Math.min(low + 1, width - 1), weight: at - low };
  });

  for (let y = 0; y < outHeight; y += 1) {
    const at = Math.min(Math.max((y + 0.5) / factor - 0.5, 0), height - 1);
    const lowRow = Math.floor(at) * width;
    const highRow = Math.min(Math.floor(at) + 1, height - 1) * width;
    const rowWeight = at - Math.floor(at);

    for (let x = 0; x < outWidth; x += 1) {
      const { low, high, weight } = columns[x];
      const a = (lowRow + low) * 4;
      const b = (lowRow + high) * 4;
      const c = (highRow + low) * 4;
      const d = (highRow + high) * 4;
      const o = (y * outWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = rgba[a + channel] * (1 - weight) + rgba[b + channel] * weight;
        const bottom = rgba[c + channel] * (1 - weight) + rgba[d + channel] * weight;
        out[o + channel] = top * (1 - rowWeight) + bottom * rowWeight;
      }
    }
  }
  return out;
}
