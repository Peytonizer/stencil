/*
  The templates the app ships. A template is a definition — its fields and a `build(values)`
  function returning layout blocks — never a parsed document. See SPEC.md.
*/

export const TEMPLATES = [];

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

/** The values a fresh form starts with. */
export function defaultValues(template) {
  return defaultsFor(template.fields, {});
}
