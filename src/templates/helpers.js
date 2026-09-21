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
