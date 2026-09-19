/*
  Page geometry for the generated notices.

  Every number here is taken from the first template's source document rather than chosen: its
  `w:sectPr` carries Word's page setup in twips, and one twip is 1/20 pt. Keep converting from
  the source rather than nudging a number to make a line look right. If a position is wrong,
  what is upstream of it is usually what's wrong.

  The exceptions are marked "chosen": things the source can't tell us, such as where a font's
  baseline sits in its line box.
*/

/** Twips (1/20 pt) to points — the unit every measurement in the source is written in. */
export const tw = (twips) => twips / 20;

/**
 * A4. The source says `w:pgSz 11906 × 16838` tw = 595.3 × 841.9 pt; pdf-lib's PageSizes.A4 is
 * 595.28 × 841.89. The 0.01–0.02 pt difference is a rounding artefact of the same paper size and
 * is far below anything visible, so the standard constant is used and the difference ignored.
 * (It is also the figure SPEC.md's 451.28 pt measure is built from.)
 */
export const PAGE = { width: 595.28, height: 841.89 };

/**
 * `w:pgMar`: top 2269 tw, right, bottom and left 1440 tw, header 708 tw. The same margins apply
 * on every page. The source's header part is empty and there is no footer.
 */
export const MARGIN = {
  top: tw(2269),
  right: tw(1440),
  bottom: tw(1440),
  left: tw(1440),
  header: tw(708),
};

/** Width of the text block: 451.28 pt. Every indent in a template is measured from its left edge. */
export const MEASURE = PAGE.width - MARGIN.left - MARGIN.right;

/**
 * Where flowing content may go, in PDF coordinates (origin bottom-left, y up). `top` and
 * `bottom` are the y of the top and bottom of the content area, the same on every page.
 */
export const CONTENT = {
  left: MARGIN.left,
  right: PAGE.width - MARGIN.right,
  top: PAGE.height - MARGIN.top,
  bottom: MARGIN.bottom,
};

/** Font sizes in points: `w:sz` is in half-points, so 24 → 12 pt and 23 → 11.5 pt. */
export const SIZE = {
  body: 12, // `w:sz 24`, used throughout
  scheduleHeading: 11.5, // `w:sz 23`, "SCHEDULE A" only
};

/** Single line spacing (`w:line 240`); in the PDF the leading is 1.2 × the font size. */
export const leading = (size) => size * 1.2;

/**
 * Baseline position within a line box, as a fraction of the font size measured down from the
 * top of the box. Chosen, not measured: Helvetica's ascender is 0.718 em and its descender
 * 0.207 em, and 0.95 leaves the descenders of one line clear of the next line's cap height at
 * 1.2 leading. Moving it shifts every line on the page together, so it can't make one line
 * look wrong relative to another.
 */
export const BASELINE_DROP = 0.95;

/**
 * The letterhead band on page 1: from the header distance (35.4 pt below the page top) to
 * 8 pt above the top margin, which is 70.05 pt tall. Full text measure, left-aligned, sitting
 * in the top margin above where the flowing text starts. The 8 pt gap is SPEC.md's choice.
 */
export const LETTERHEAD = {
  x: CONTENT.left,
  width: MEASURE,
  top: PAGE.height - MARGIN.header,
  bottom: PAGE.height - (MARGIN.top - 8),
};

/** A rule excerpt's tallest allowed height, so one big screenshot can't take a whole page. Chosen. */
export const IMAGE_MAX_HEIGHT = 300;

/** The common seal's box: about 6.3 × 4.9 cm, the room noshow's form gives a seal. */
export const SEAL_BOX = { width: 180, height: 140 };

/** Missing values are drawn in this red in the preview, as the source template's placeholders are. */
export const MISSING_COLOUR = { r: 0.8, g: 0, b: 0 };
