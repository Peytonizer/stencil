/*
  Turns the words Tesseract found in a screenshot of the Lot/Owner screen into values for the
  form. Pure functions over word boxes, so the guessing is tested without an OCR engine.

  The screen is labels with input boxes to their right: "Suburb*  [ Canberra ]". Tesseract's own
  line and paragraph grouping is no use here, because the left column and the Owner Info panel
  share a baseline and come back as one line, or as none. So this works from word boxes alone:
  find the label words, then take the words to the right of a label up to the next label.

  The U/Plan box holds more than the plan number: "<plan number> <building name> <address>".
  The number and the building name are taken from it; the address is ignored, because the Street
  No and Street Name boxes give the same thing more reliably.

  The short values (lot, unit, street number) sit in small boxes right against their labels, where
  Tesseract's first pass reads them worst. `parseLotOwner` reports where it found each (`regions`),
  the caller reads those crops again on their own, and passes what it got back in as `rereads`;
  the better-scored reading of the two is used.

  Nothing here is trusted. A label that is garbled is simply not found, and a value that fails its
  shape check (an email with no "@") is dropped, so the field stays blank and is listed as unread.
  A blank field is caught by the download gate; a wrong one would be sent. Every value returned
  carries the lowest word confidence that went into it, for the form to show.
*/

/** The labels this reads, and the field each one fills. `key` is the label lower-cased with
 *  everything but letters removed, which absorbs the red asterisk, the colon and OCR's stray
 *  punctuation. */
const READ = {
  uplan: 'unitsPlanNumber',
  lot: 'lotNumber',
  unit: 'unitNumber',
  streetno: 'streetNumber',
  streetname: 'streetName',
  suburb: 'suburb',
  ownername: 'ownerName',
  email: 'ownerEmail',
};

/** Labels on the same screen that are not read. They matter only because they end the value
 *  before them: without "Accessory Unit" the Suburb row would run into it. */
const OTHER = [
  'accessoryunit',
  'uoe',
  'crn',
  'ownerinfo',
  'ah',
  'bh',
  'salutation',
  'mobile',
  'contactname',
  'fax',
  'paidto',
  'lastsettled',
  'committeemember',
  'changeowner',
];

const KEYS = [...Object.keys(READ), ...OTHER];

/** How the form names each label, for saying which ones weren't read. */
const LABEL_NAME = {
  uplan: 'U/Plan',
  lot: 'Lot',
  unit: 'Unit',
  streetno: 'Street No',
  streetname: 'Street Name',
  suburb: 'Suburb',
  ownername: 'Owner Name',
  email: 'Email',
};

/** Words within a value sit closer together than this many word-heights. The first word of a
 *  value is exempt: the box's left edge can be a long way from the label. */
const VALUE_GAP = 1.5;

/** Below this word confidence (0 to 100) a value is not filled in at all. Every wrong read seen
 *  while building this scored under 50 (a plan number read as 1254 at 35, an email missing its
 *  first half at 9, black bars read as "text" at 0 to 38) and every right one scored over it. A
 *  value that low is noise, and a warning under noise is worse than a blank the download gate
 *  will catch. Between here and the form's own warning threshold the value is filled and flagged.
 *  Chosen from a handful of samples; revisit it against real screenshots. */
const MIN_CONFIDENCE = 50;

/** The fields whose boxes are worth reading a second time, on their own. */
const REREAD = new Set(['lotNumber', 'unitNumber', 'streetNumber']);

/** With no word found in a box at all, look this far to the right of its label (in the image's own
 *  pixels), stopping at the next label. The boxes are 40 to 90 px wide on the real screen. */
const BLIND_REACH = 50;

const norm = (text) => text.toLowerCase().replace(/[^a-z]/g, '');

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/** A label key that `text` reads as. One slip is forgiven in a label of five letters or more
 *  ("emai1"); short ones such as "lot" and "unit" must be exact, or "Lot" would match "not". */
function labelKey(text) {
  const t = norm(text);
  if (!t) return null;
  return KEYS.find((key) => key === t || (key.length >= 5 && distance(key, t) <= 1)) ?? null;
}

/** Group words into rows by vertical centre. The left column and the Owner Info panel are not
 *  aligned to the pixel, so a row is anything within 0.6 of a word's height. */
function toRows(words) {
  const sorted = words.toSorted((a, b) => a.y - b.y);
  const rows = [];
  for (const word of sorted) {
    const row = rows.find((r) => Math.abs(r.y - word.y) <= 0.6 * Math.max(r.h, word.h));
    if (row) {
      row.words.push(word);
      row.y = row.words.reduce((sum, x) => sum + x.y, 0) / row.words.length;
    } else {
      rows.push({ y: word.y, h: word.h, words: [word] });
    }
  }
  for (const row of rows) row.words.sort((a, b) => a.x0 - b.x0);
  return rows;
}

/** Mark the label words in a row, longest label first so "Accessory Unit" isn't read as "Unit".
 *  Returns `[{ key, at, end }]`, where `at` is the label's first word and `end` is one past its
 *  last. */
function findLabels(row) {
  const labels = [];
  const { words } = row;
  for (let i = 0; i < words.length; ) {
    let found = null;
    for (let n = Math.min(3, words.length - i); n >= 1 && !found; n -= 1) {
      // Words of one label sit close together; anything wider is two things that happen to be
      // side by side, such as a value and the next label.
      const span = words.slice(i, i + n);
      const gap = span.slice(1).some((w, k) => w.x0 - span[k].x1 > VALUE_GAP * row.h);
      // No label has a digit in it. Without this, `norm` (which drops digits) would read the
      // value "12" in "Lot* 12" as part of the label "Lot" and swallow it.
      const digits = span.some((w) => /\d/.test(w.text));
      const key = gap || digits ? null : labelKey(span.map((w) => w.text).join(''));
      if (key) found = { key, at: i, end: i + n };
    }
    if (found) {
      labels.push(found);
      i = found.end;
    } else {
      i += 1;
    }
  }
  return labels;
}

/** The words after a label, up to the next label or a gap. */
function valueAfter(row, labels, label) {
  const next = labels.find((l) => l.at >= label.end);
  const stop = next ? next.at : row.words.length;
  const taken = [];
  for (const word of row.words.slice(label.end, stop)) {
    const before = taken[taken.length - 1];
    if (before && word.x0 - before.x1 > VALUE_GAP * row.h) break;
    taken.push(word);
  }
  return taken;
}

/** Box borders and the asterisk cling to short values as stray punctuation ("|12", "12'"). */
const edges = (text) => text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');

/** A short code such as a lot or unit number: letters, digits, slash or dash, up to `max` long. */
const code = (max) => (text) => {
  const trimmed = edges(text);
  return trimmed.length <= max && /^[A-Za-z0-9/-]+$/.test(trimmed) ? trimmed : null;
};

/** Per-field shape checks. A value that fails one is treated as unread. The U/Plan box has its own
 *  reader, `readPlanBox`. */
const CLEAN = {
  lotNumber: code(6),
  unitNumber: code(6),
  streetNumber: code(8),
  streetName: (text) => (/[A-Za-z]{2}/.test(text) ? text : null),
  suburb: (text) => (/[A-Za-z]{2}/.test(text) ? text : null),
  ownerName: (text) => (/[A-Za-z]{2}/.test(text) ? text : null),
  // The whole value must be one address. Tesseract sometimes splits one at a dot ("jane" and
  // "citizen@example.com"); matching inside that would keep the tail and drop the rest, which is a
  // different, plausible-looking address. A split one is unread instead.
  ownerEmail: (text) => (/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(text) ? text : null),
};

/** A short label with its value printed against it. On the real screen the asterisk in "Lot*"
 *  touches the box and the value starts at the box's edge, so Tesseract can return "Lot*12" as one
 *  word, which is neither a label (it has digits) nor a value. Split it in two, dividing the box by
 *  character, which is only as accurate as it needs to be to keep the two in reading order. */
const FUSED = /^(lot|unit)(?:[^A-Za-z0-9]+([A-Za-z0-9][A-Za-z0-9/-]*)|(\d[A-Za-z0-9/-]*))$/i;

function splitFused(box) {
  const match = box.text.match(FUSED);
  if (!match) return [box];
  const value = match[2] ?? match[3];
  const cut = box.text.length - value.length;
  const x = box.x0 + ((box.x1 - box.x0) * cut) / box.text.length;
  return [
    { ...box, text: box.text.slice(0, cut), x1: x },
    { ...box, text: value, x0: x },
  ];
}

/** The U/Plan box: the plan number is the first word with a digit in it, the building name is the
 *  words after it, and the address (which is ignored) begins at the next word with a digit, which
 *  is its street number. With no digit to go on the address is taken to begin where the street's
 *  name first appears (`streetFirstWord`, from the Street Name box), but never at the box's first
 *  word after the number, since a building often shares its street's name ("Sunset Apartments,
 *  Sunset Street"). Where the name ends is a guess, so it carries a note. */
function readPlanBox(words, streetFirstWord) {
  const at = words.findIndex((w) => /\d/.test(w.text));
  if (at < 0) return { plan: null, building: null };
  const plan = { value: words[at].text.match(/\d{1,6}/)[0], confidence: words[at].confidence };

  const rest = words.slice(at + 1);
  let end = rest.findIndex((w) => /\d/.test(w.text));
  if (end < 0 && streetFirstWord) {
    end = rest.findIndex((w, i) => i > 0 && norm(w.text) === streetFirstWord);
  }
  const name = (end < 0 ? rest : rest.slice(0, end));
  const text = name
    .map((w) => w.text)
    .join(' ')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[\s,;:|\-–—]+$/, '');
  const building =
    /[A-Za-z]{2}/.test(text) && name.length
      ? {
          value: text,
          confidence: Math.min(...name.map((w) => w.confidence)),
          note: 'Taken from the U/Plan box, between the plan number and the address. Check where the name ends.',
        }
      : null;
  return { plan, building };
}

/** Where a short value is: the box around the words found, or, if none were, the stretch to the
 *  right of its label. Rows are described by their centre and height, so this turns that back into
 *  a rectangle. */
function regionOf(row, label, taken, next) {
  if (taken.length) {
    return {
      x0: Math.min(...taken.map((w) => w.x0)),
      x1: Math.max(...taken.map((w) => w.x1)),
      y0: Math.min(...taken.map((w) => w.y - w.h / 2)),
      y1: Math.max(...taken.map((w) => w.y + w.h / 2)),
    };
  }
  const start = row.words[label.end - 1].x1;
  const stop = next ? row.words[next.at].x0 : start + BLIND_REACH;
  return { x0: start, x1: Math.min(stop, start + BLIND_REACH), y0: row.y - row.h / 2, y1: row.y + row.h / 2 };
}

/**
 * `words` are `{ text, bbox: { x0, y0, x1, y1 }, confidence }` as Tesseract reports them, in the
 * image's own pixels. `rereads` is `{ [fieldId]: { text, confidence } }` for any of the fields
 * named in `regions`, read again on their own. Returns
 *
 *   fields    `{ [formFieldId]: { value, confidence, note? } }`, only for what was read
 *   unread    label names found on the screen but with nothing usable beside them
 *   notFound  label names not found at all
 *   regions   `{ [fieldId]: { x0, y0, x1, y1 } }` where a short value is, or should be, to be
 *             read again
 */
export function parseLotOwner(words, rereads = {}) {
  const boxes = words
    .filter((w) => w.text?.trim())
    .map((w) => ({
      text: w.text.trim(),
      x0: w.bbox.x0,
      x1: w.bbox.x1,
      y: (w.bbox.y0 + w.bbox.y1) / 2,
      h: w.bbox.y1 - w.bbox.y0,
      confidence: w.confidence,
    }))
    .flatMap(splitFused);

  const read = {};
  const regions = {};
  let planWords = null;
  for (const row of toRows(boxes)) {
    const labels = findLabels(row);
    for (const label of labels) {
      if (!(label.key in READ) || READ[label.key] in read) continue;
      const taken = valueAfter(row, labels, label);
      if (label.key === 'uplan') {
        // Read after the loop, once the Street Name box (a row below) has been read.
        planWords = taken;
        read.unitsPlanNumber = null;
        continue;
      }
      const id = READ[label.key];

      if (REREAD.has(id)) {
        const next = labels.find((l) => l.at >= label.end);
        regions[id] = regionOf(row, label, taken, next);
      }

      let value = CLEAN[id](taken.map((w) => w.text).join(' '));
      let confidence = taken.length ? Math.min(...taken.map((w) => w.confidence)) : 0;
      const again = rereads[id];
      if (again) {
        const clean = CLEAN[id](again.text);
        if (clean && again.confidence >= confidence) {
          value = clean;
          confidence = again.confidence;
        }
      }
      read[id] = value && confidence >= MIN_CONFIDENCE ? { value, confidence } : null;
    }
  }

  let building = null;
  if (planWords) {
    const first = norm(read.streetName?.value.split(' ')[0] ?? '');
    const box = readPlanBox(planWords, first.length >= 3 ? first : null);
    if (box.plan && box.plan.confidence >= MIN_CONFIDENCE) read.unitsPlanNumber = box.plan;
    if (box.building && box.building.confidence >= MIN_CONFIDENCE) building = box.building;
  }

  const fields = {};
  const unread = [];
  const notFound = [];
  if (building) fields.buildingName = building;
  for (const [key, id] of Object.entries(READ)) {
    if (read[id]) {
      if (id !== 'streetNumber' && id !== 'streetName') fields[id] = read[id];
    } else {
      (id in read ? unread : notFound).push(LABEL_NAME[key]);
    }
  }

  // One form field from two boxes. A blank Street No is legitimate (the number can sit in Street
  // Name), so the address is built from whatever was read, with a note if the number wasn't.
  const { streetNumber, streetName } = read;
  if (streetName) {
    fields.streetAddress = {
      value: [streetNumber?.value, streetName.value].filter(Boolean).join(' '),
      confidence: Math.min(streetName.confidence, streetNumber?.confidence ?? 100),
      ...(streetNumber ? {} : { note: 'No street number was read. Add it if there is one.' }),
    };
  }

  return { fields, unread, notFound, regions };
}
