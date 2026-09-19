/*
  The templates the app ships. A template is a definition — its fields and a `build(values)`
  function returning layout blocks — never a parsed document. See SPEC.md.
*/

import { infringementNotice } from './infringement-notice.js';
import { isFilled } from './helpers.js';

export const TEMPLATES = [infringementNotice];

export function getTemplate(id) {
  return TEMPLATES.find((template) => template.id === id) ?? null;
}

/** A field's starting value: its `default` (a value, or a function of the values so far), else empty. */
function initialValue(field, values) {
  if (field.default !== undefined) {
    return typeof field.default === 'function' ? field.default(values) : field.default;
  }
  if (field.type === 'checkbox') return false;
  if (field.type === 'image') return null;
  if (field.type === 'group') {
    return Array.from({ length: field.min ?? 1 }, () => defaultsFor(field.fields, {}));
  }
  return '';
}

function defaultsFor(fields, seed) {
  const values = { ...seed };
  // In schema order, so a default that follows another field (the confirm-by date follows the
  // notice date) sees the value it depends on.
  for (const field of fields) values[field.id] = initialValue(field, values);
  return values;
}

/** A new, empty item for a repeatable group, e.g. one more rule. */
export function defaultGroupItem(field) {
  return defaultsFor(field.fields, {});
}

/** The values a fresh form starts with. */
export function defaultValues(template) {
  return defaultsFor(template.fields, {});
}

const isRequired = (field, values) =>
  typeof field.required === 'function' ? field.required(values) : Boolean(field.required);

function missingIn(fields, values, prefix, missing) {
  for (const field of fields) {
    if (field.showIf && !field.showIf(values)) continue;
    const path = `${prefix}${field.id}`;
    if (field.type === 'group') {
      const items = values[field.id] ?? [];
      if (isRequired(field, values) && items.length < (field.min ?? 1)) missing.push(path);
      for (const [index, item] of items.entries()) {
        missingIn(field.fields, item, `${path}.${index}.`, missing);
      }
    } else if (isRequired(field, values) && !isFilled(values[field.id])) {
      missing.push(path);
    }
  }
  return missing;
}

/**
 * The required-but-empty fields, as paths such as `ownerName` or `rules.0.breachDetails`.
 * Download is enabled exactly when this is empty, so a placeholder can never reach a sent
 * notice. Fields hidden by `showIf` are skipped: nobody can fill in what they can't see.
 */
export function missingFields(template, values) {
  return missingIn(template.fields, values, '', []);
}
