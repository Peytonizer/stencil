/*
  Turns a template's blocks into pages of draw operations.

  Nothing here touches pdf-lib's drawing API. The result is plain data — `pages[].ops`, each a
  positioned piece of text, an image or a border — so pagination can be tested by asserting on
  coordinates, and render.js is the only place that knows how to put them in a PDF. The fonts
  are needed only for their metrics.

  Coordinates are PDF's: origin bottom-left, y up. `y` in this file is the top of the next
  line box, moving down the page.

  Block types (see SPEC.md, "Data shapes"):
    para    { runs, x, align, size, lineSpacing, keepWithNext }
    item    { marker, markerX, markerBold, runs, x, align, size, lineSpacing, keepWithNext }
    blank   one empty line, or a gap of `height` pt
    image   { image, x, align, border, borderWidth, maxWidth, maxHeight }
    keep    { blocks } — never split across pages
    letterhead { image } or { placeholder } — the header band of every page, outside the flow
*/

import { justifyExtra, fontKey, runColour, wrapRuns } from './flow.js';
import {
  BASELINE_DROP,
  CONTENT,
  IMAGE_MAX_HEIGHT,
  LETTERHEAD,
  MEASURE,
  MISSING_COLOUR,
  SIZE,
  leading,
} from './geometry.js';

/** Floating-point slack when asking whether something fits: 1/100 pt is invisible. */
const EPSILON = 0.01;

const CONTENT_HEIGHT = CONTENT.top - CONTENT.bottom;

/** Scale an image to fit a box, keeping its aspect and never enlarging it past 1 px = 1 pt. */
function fitImage(image, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return { width: image.width * scale, height: image.height * scale };
}

/** The x that centres something `width` wide across the letterhead band. */
const centredInBand = (width) => LETTERHEAD.x + (LETTERHEAD.width - width) / 2;

/**
 * Work out a block's wrapped lines and heights once, ahead of placing it, so keep groups and
 * keep-with-next can ask "how tall is this?" without laying it out.
 */
function prepare(block, fonts) {
  switch (block.type) {
    case 'blank': {
      // A gap of an exact height is how a template reproduces Word's space after a paragraph.
      const height = block.height ?? leading(block.size ?? SIZE.body);
      return { block, kind: 'blank', height, firstHeight: height };
    }
    case 'para':
    case 'item': {
      const size = block.size ?? SIZE.body;
      const x = block.x ?? 0;
      // `lineSpacing` is Word's "multiple" line spacing (`w:line` over 240), 1 when the source
      // says 240.
      const lead = leading(size) * (block.lineSpacing ?? 1);
      const runs = block.runs.map((run) => ({ ...run, size }));
      const lines = wrapRuns(runs, fonts, MEASURE - x);
      return {
        block,
        kind: block.type,
        size,
        x,
        lead,
        lines,
        height: lines.length * lead,
        firstHeight: lines.length ? lead : 0,
        keepWithNext: Boolean(block.keepWithNext),
      };
    }
    case 'image': {
      const x = block.x ?? 0;
      const box = fitImage(
        block.image,
        block.maxWidth ?? MEASURE - x,
        Math.min(block.maxHeight ?? IMAGE_MAX_HEIGHT, CONTENT_HEIGHT),
      );
      // Centred across the space to the right of `x`; the source's anchored images are
      // `positionH align center` relative to the margin.
      const left = block.align === 'center' ? x + (MEASURE - x - box.width) / 2 : x;
      return { block, kind: 'image', x: left, ...box, height: box.height, firstHeight: box.height };
    }
    case 'keep': {
      const items = block.blocks.map((child) => prepare(child, fonts));
      const height = items.reduce((sum, item) => sum + item.height, 0);
      return { block, kind: 'keep', items, height, firstHeight: height };
    }
    case 'letterhead': {
      // Drawn on every page's header band, so it takes no room in the flow (height 0).
      if (!block.image) {
        // No letterhead yet: a red placeholder stands in for it in the preview.
        const width = fonts.regular.widthOfTextAtSize(block.placeholder, SIZE.body);
        return {
          block,
          kind: 'letterhead',
          op: {
            op: 'text',
            text: block.placeholder,
            x: centredInBand(width),
            y: LETTERHEAD.top - BASELINE_DROP * SIZE.body,
            width,
            font: 'regular',
            size: SIZE.body,
            color: MISSING_COLOUR,
          },
        };
      }
      const box = fitImage(block.image, LETTERHEAD.width, LETTERHEAD.top - LETTERHEAD.bottom);
      return {
        block,
        kind: 'letterhead',
        op: {
          op: 'image',
          image: block.image,
          x: centredInBand(box.width),
          y: LETTERHEAD.top - box.height,
          width: box.width,
          height: box.height,
          border: false,
        },
      };
    }
    default:
      throw new Error(`Unknown block type: ${block.type}`);
  }
}

export function layoutBlocks(blocks, fonts) {
  const prepared = blocks.map((block) => prepare(block, fonts));
  const letterhead = prepared.find((item) => item.kind === 'letterhead');
  const items = prepared.filter((item) => item.kind !== 'letterhead');
  const pages = [];
  let page;
  let y;

  const newPage = () => {
    page = { ops: [] };
    pages.push(page);
    y = CONTENT.top;
    // The letterhead is every page's header, drawn in the top margin above the text.
    if (letterhead) page.ops.push({ ...letterhead.op });
  };
  const atTop = () => y >= CONTENT.top - EPSILON;
  const room = () => y - CONTENT.bottom;
  /** Start a new page unless this one is already fresh: breaking again would gain nothing. */
  const breakPage = () => {
    if (!atTop()) newPage();
  };

  function emitLine(item, line, isFirst) {
    const left = CONTENT.left + item.x;
    const baseline = y - BASELINE_DROP * item.size;

    if (isFirst && item.kind === 'item') {
      page.ops.push({
        op: 'text',
        text: item.block.marker,
        x: CONTENT.left + item.block.markerX,
        y: baseline,
        width: 0,
        font: item.block.markerBold ? 'bold' : 'regular',
        size: item.size,
        color: null,
      });
    }

    const extra = item.block.align === 'justify' ? justifyExtra(line, MEASURE - item.x) : 0;
    let cx = left;
    let previous = null;
    for (const piece of line.pieces) {
      const font = fontKey(piece.run);
      const color = runColour(piece.run);
      const width = piece.width + (extra && /^\s+$/.test(piece.text) ? extra : 0);
      // Pieces in one style on an unjustified line are drawn as a single string, so the PDF's
      // text can be searched and copied with its spaces. A justified line is drawn word by
      // word, since each gap has its own width.
      if (!extra && previous && previous.font === font && previous.color === color) {
        previous.text += piece.text;
        previous.width += width;
      } else {
        previous = { op: 'text', text: piece.text, x: cx, y: baseline, width, font, size: item.size, color };
        page.ops.push(previous);
      }
      cx += width;
    }
    y -= item.lead;
  }

  function placeText(item) {
    for (const [n, line] of item.lines.entries()) {
      if (room() < item.lead - EPSILON) breakPage();
      emitLine(item, line, n === 0);
    }
  }

  function placeImage(item) {
    if (room() < item.height - EPSILON) breakPage();
    page.ops.push({
      op: 'image',
      image: item.block.image,
      x: CONTENT.left + item.x,
      y: y - item.height,
      width: item.width,
      height: item.height,
      border: Boolean(item.block.border),
      borderWidth: item.block.borderWidth ?? 1,
    });
    y -= item.height;
  }

  function place(list, index) {
    const item = list[index];
    switch (item.kind) {
      case 'blank':
        // A blank at the top of a page is spacing between things that are no longer together.
        if (atTop()) break;
        if (room() < item.height - EPSILON) {
          breakPage();
          break;
        }
        y -= item.height;
        break;
      case 'para':
      case 'item':
        if (item.keepWithNext) keepWithFollowing(list, index);
        placeText(item);
        break;
      case 'image':
        placeImage(item);
        break;
      case 'keep':
        // Moves whole to the next page if it won't fit here. One taller than a page is laid
        // out normally: keeping it together is impossible, so it just flows.
        if (item.height > room() + EPSILON && item.height <= CONTENT_HEIGHT) breakPage();
        for (let i = 0; i < item.items.length; i++) place(item.items, i);
        break;
    }
  }

  /**
   * A keep-with-next paragraph must share a page with the first line of what follows it. The
   * chain runs through any blank lines between them, and on through the next paragraph if that
   * one is keep-with-next as well (a heading, a blank, then a sub-heading, say). If the whole
   * chain won't fit in the room left, everything moves to a fresh page.
   *
   * When what follows is a `keep` group (clause 3 and the seal block), the group counts at its
   * full height, not its first line. SPEC.md says "first line of the next block"; read
   * literally, that would leave clause 3 alone at the foot of a page and put the seal block by
   * itself on the next, an execution page with none of the notice's text. Open for review: to
   * follow the spec literally, use `firstHeight` of the group's first child here.
   */
  function keepWithFollowing(list, index) {
    let need = 0;
    for (let j = index; j < list.length; j++) {
      const item = list[j];
      if (j === index || item.kind === 'blank') {
        need += item.height;
      } else if (item.keepWithNext) {
        need += item.height;
      } else {
        need += item.firstHeight;
        break;
      }
    }
    if (need > room() + EPSILON && need <= CONTENT_HEIGHT) breakPage();
  }

  newPage();
  for (let i = 0; i < items.length; i++) place(items, i);
  return pages;
}
