/*
  What every template needs and none should redefine: trimming, "is this filled?", and the
  red placeholder that stands in for a missing value in the preview.
*/

/** A text value as it will be used: trimmed. A non-string (an image, a checkbox) passes through. */
export function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

/** Whether a field has what it needs. An email is filled when it is non-empty; nothing checks its syntax. */
export function isFilled(value) {
  if (value == null || value === false) return false;
  return typeof value === 'string' ? value.trim() !== '' : true;
}

/**
 * A run for a field's value. When the value is empty the run is the field's bracketed
 * placeholder, flagged `missing` so it is drawn in red. The download is disabled while any
 * required value is missing, so a placeholder can only ever be seen in the preview.
 */
export function valueRun(field, value, style = {}) {
  const text = clean(value);
  return text ? { text, ...style } : { text: field.placeholder, missing: true, ...style };
}

/** Characters a filename can't carry on Windows or macOS become hyphens. */
export const forFilename = (text) => clean(text).replace(/[\\/:*?"<>|\p{Cc}]/gu, '-');

/** True when `text` already starts with a care-of prefix ("C/O", or the older "C/-"), so it is
 *  not given a second one. Case insensitive: a person typing doesn't reliably capitalise it. */
const CARE_OF_PREFIX = /^c\/[o-]/i;

/**
 * A care-of value with "C/O " in front, unless the user already typed a prefix themselves (Matt,
 * 2026-09-22). Shared by every template with a care-of field, so the same habits (typing "C/-",
 * or "C/O" already) are recognised everywhere rather than on one form only.
 */
export function careOfValue(value) {
  const text = clean(value);
  if (!text) return '';
  return CARE_OF_PREFIX.test(text) ? text : `C/O ${text}`;
}
