/*
  Validating and, if need be, shrinking or reorienting an image before it goes anywhere near
  the PDF: the rule excerpt, the common seal and the letterhead all come through here.

  Things this guards against: a file that isn't a JPEG or PNG — rejected with a message before
  pdf-lib ever sees it, rather than the exception pdf-lib would throw trying to embed something
  else as one of those two formats — and a phone photo at full sensor resolution, which would
  otherwise turn a notice of a few kilobytes into several megabytes over an image that only ever
  prints a few centimetres wide.

  Detection reads the file's own magic bytes rather than trusting `file.type`: a renamed
  extension, a browser that guesses wrong, or a file picked up via drag-and-drop with no MIME
  type at all would otherwise sail through as whichever branch happened to run.

  Generalised from noshow's seal.js.
*/

/** Above this many pixels on the longest side, the image is downscaled before embedding. */
const MAX_DIMENSION = 1600;

/** A mid-high JPEG quality: a real size reduction on a phone photo, with no visible loss at the
 *  size these images print. Not a measured value — the source document has nothing to measure it
 *  against. */
const JPEG_QUALITY = 0.9;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JPEG starts with an SOI marker (`\xff\xd8\xff`); PNG has an 8-byte signature. Anything else
 *  — a GIF, a PDF, a HEIC straight off an iPhone camera — is rejected. Returns 'jpeg', 'png'
 *  or null. */
export function detectImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    return 'png';
  }
  return null;
}

/**
 * Read a file, reject anything that isn't a JPEG or PNG, and return
 * `{ image: { bytes, type, width, height } }`. Never throws: the result is either `{ image }`
 * or `{ error }`, so a bad file becomes a status message rather than a crash.
 *
 * `width` and `height` are in pixels, which layout treats as points (1 px = 1 pt).
 *
 * A JPEG always goes through a canvas. Phone photos carry their rotation in an EXIF flag that
 * pdf-lib ignores, while `createImageBitmap` applies it, so the bitmap's size and the file's
 * pixels would disagree and the image would print stretched. Redrawing bakes the rotation in,
 * so the bytes and the size agree. A PNG has no such flag and only goes through a canvas when
 * it is oversize.
 */
export async function prepareImage(file, label = 'The image') {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) {
    return { error: `${label} must be a JPEG or PNG image.` };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: `image/${type}` }), {
      imageOrientation: 'from-image',
    });
  } catch {
    return { error: `${label} couldn't be read as an image.` };
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (type === 'png' && longest <= MAX_DIMENSION) {
      return { image: { bytes, type, width: bitmap.width, height: bitmap.height } };
    }

    const scale = Math.min(1, MAX_DIMENSION / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, `image/${type}`, type === 'jpeg' ? JPEG_QUALITY : undefined),
    );
    return {
      image: {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        type,
        width: canvas.width,
        height: canvas.height,
      },
    };
  } finally {
    bitmap.close();
  }
}
