/*
  A very small text engine: wrap styled runs to a width, and justify the lines.

  pdf-lib draws strings at coordinates and nothing more — it has no notion of a paragraph, a
  line break or a font change mid-sentence. The notices are prose in which a run of bold or
  italic sits inside an otherwise plain sentence, so something has to measure words against a
  width and switch fonts inside a line. That is all this does.

  It is deliberately not a layout engine: no hyphenation and no widow control. Justification is
  here because the source justifies its numbered clauses at a wide measure, where ragged right
  is visibly different from the Word original. Page breaks are layout.js's business.

  Copied from noshow's flow.js and extended with justification, hard line breaks and colour.
*/

import { MISSING_COLOUR } from './geometry.js';

/**
 * A run is a piece of text in one style: `{ text, bold, italic, missing, size }`. A paragraph
 * is an array of runs. `fonts` is `{ regular, bold, italic, boldItalic }` of embedded pdf-lib
 * fonts. `size` is stamped on by layout.js from the block, so templates never write it.
 */
export function fontKey(run) {
  if (run.bold && run.italic) return 'boldItalic';
  if (run.bold) return 'bold';
  if (run.italic) return 'italic';
  return 'regular';
}

/** The colour a run is drawn in: red for a missing value's placeholder, otherwise the default. */
export function runColour(run) {
  return run.missing ? MISSING_COLOUR : null;
}

const printableCache = new WeakMap();

/** The code points the regular font's WinAnsi encoding can draw, cached per font. */
function encodable(fonts) {
  let set = printableCache.get(fonts.regular);
  if (!set) {
    set = new Set(fonts.regular.getCharacterSet());
    printableCache.set(fonts.regular, set);
  }
  return set;
}

/**
 * Make user-typed text safe to measure and draw.
 *
 * The standard 14 fonts only encode WinAnsi, and pdf-lib throws when asked to measure or draw
 * anything else — one pasted emoji would otherwise stop the preview rebuilding at all. Common
 * lookalikes are normalised first (non-breaking spaces, zero-width characters, tabs, CRLF), and
 * whatever is still unencodable becomes a visible "?" rather than vanishing: a wrong character
 * the user can see is a better failure than a silently altered notice. Newlines are kept.
 */
export function printable(text, fonts) {
  const set = encodable(fonts);
  const cleaned = text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\t/g, ' ');
  let out = '';
  for (const ch of cleaned) {
    out += ch === '\n' || set.has(ch.codePointAt(0)) ? ch : '?';
  }
  return out;
}

const isSpace = (word) => /^\s+$/.test(word);

/**
 * Break runs into lines that fit `width`.
 *
 * Words are split on spaces and kept with their run's style. A word longer than the measure is
 * left to overflow rather than broken: a visible overflow is a better bug report than a
 * silently chopped rule number. A newline in a run's text ends the line there, as the user
 * typed it, and a blank line between two newlines is kept as an empty line.
 *
 * Returns an array of lines, each `{ pieces, last }`. `pieces` is an array of
 * `{ text, run, width }`; `last` is true for a line that must not be justified — the final line
 * of the paragraph and any line ending at a hard break.
 */
export function wrapRuns(runs, fonts, width) {
  const lines = [];
  let line = [];
  let used = 0;

  const trimTrailingSpace = () => {
    while (line.length && isSpace(line[line.length - 1].text)) line.pop();
  };
  const finish = (last) => {
    trimTrailingSpace();
    lines.push({ pieces: line, last });
    line = [];
    used = 0;
  };

  for (const run of runs) {
    const font = fonts[fontKey(run)];
    // Keep the spaces: splitting on the space itself and re-adding it would lose the double
    // spaces the source document uses after some full stops.
    const tokens = printable(run.text, fonts)
      .split(/(\n|[^\S\n]+)/)
      .filter((token) => token !== '');
    for (const token of tokens) {
      if (token === '\n') {
        finish(true);
        continue;
      }
      const w = font.widthOfTextAtSize(token, run.size);
      if (!isSpace(token) && used + w > width && line.length > 0) {
        finish(false);
      }
      if (isSpace(token) && line.length === 0) continue; // no leading space on a fresh line
      line.push({ text: token, run, width: w });
      used += w;
    }
  }
  // A trailing hard break doesn't add an empty last line; the paragraph simply ends.
  if (line.length) finish(true);
  return lines;
}

/**
 * Justify a line to `width`: spread the slack evenly across its space pieces. Returns the
 * extra width each space gets, or 0 when the line shouldn't be stretched — the last line of a
 * paragraph, a line with no spaces, or one already too wide (a long word that overflowed).
 */
export function justifyExtra(line, width) {
  if (line.last) return 0;
  const gaps = line.pieces.filter((piece) => isSpace(piece.text)).length;
  if (gaps === 0) return 0;
  const used = line.pieces.reduce((sum, piece) => sum + piece.width, 0);
  return Math.max(0, (width - used) / gaps);
}
